// TikTok Scraper Core - Content Scripts
// Verified DOM selectors from live TikTok inspection (March 2026)
console.log("🚀 [TikTok Cleaner] Script Injected Successfully.");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomSleep = (min: number, max: number) => sleep(Math.floor(Math.random() * (max - min + 1) + min));

let isRunning = false;
let isPaused = false;
let unlikeCount = 0;

// ==========================================
// DOM SELECTORS (Verified from live TikTok)
// ==========================================

// Tab navigasi profil
const SELECTORS = {
  // Profile tabs
  LIKED_TAB: '[data-e2e="liked-tab"]',
  FAVORITES_TAB: '[data-e2e="favorites-tab"]',
  REPOST_TAB: '[data-e2e="repost-tab"]',
  
  // Video grid
  VIDEO_LIST: '[data-e2e="user-post-item-list"]',
  VIDEO_ITEM: '[data-e2e="user-post-item"]',
  REPOST_LIST: '[data-e2e="user-repost-item-list"]',
  REPOST_ITEM: '[data-e2e="user-repost-item"]',
  
  // Tombol aksi di dalam modal video (browse mode)
  LIKE_ICON: '[data-e2e="browse-like-icon"]',
  FAVORITE_ICON: '[data-e2e="browse-favorite-icon"]',
  FAVORITE_ICON_ALT: '[data-e2e="undefined-icon"]', // TikTok obfuscation/bug
  REPOST_ICON: '[data-e2e="video-share-repost"]',
  REPOST_TAG: '[data-e2e="repost-tag"]',
  
  // Fallback selectors untuk like button (beberapa versi TikTok)
  LIKE_ICON_ALT: '[data-e2e="like-icon"]',
  
  // Navigasi antar video
  NEXT_VIDEO: '[data-e2e="arrow-right"]',
  NEXT_VIDEO_ALT: 'button[aria-label="Go to next video"]',
  NEXT_VIDEO_ALT2: 'button[aria-label="Next video"]',
  
  // Profile sidebar
  NAV_PROFILE: '[data-e2e="nav-profile"]',
  
  // Following list (untuk Unfollow)
  FOLLOWING_COUNT: '[data-e2e="following-count"]',
};

// Warna yang menandakan tombol aktif (Liked = merah, Favorited = kuning)
const ACTIVE_COLORS = {
  LIKE_RED: 'rgb(255, 59, 92)',       // Warna merah love TikTok
  LIKE_RED_HEX: '#fe2c55',
  LIKE_RED_ALT: '255, 59, 92',
  FAV_YELLOW: 'rgb(250, 206, 21)',
  FAV_YELLOW_HEX: '#face15',
  FAV_YELLOW_ALT: '250, 206, 21',
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const broadcastStatus = (extra?: Record<string, any>) => {
  chrome.runtime.sendMessage({ 
    event: 'status_update', 
    isRunning, 
    isPaused, 
    unlikeCount,
    ...extra 
  }).catch(() => {});
};

const isCaptchaPresent = (): boolean => {
  const captchaWrap = document.querySelector('#captcha-verify-image, [id^="secsdk-captcha"], #captcha_container, .captcha_verify_container');
  const bodyText = document.body.innerText || '';
  return !!captchaWrap || bodyText.includes('Drag the slider') || bodyText.includes('Geser slider') || bodyText.includes('verify to continue') || bodyText.includes('fit the puzzle');
};

const checkLogin = (): boolean => {
  // 1. Cek tombol Login di top header atau sidebar
  const loginBtn = document.querySelector('[data-e2e="top-login-button"], [data-e2e="nav-login-button"], [data-e2e="header-login-button"]');
  
  // 2. Cek icon profile di kanan atas (Hanya ada kalau sudah login)
  const profileIcon = document.querySelector('[data-e2e="profile-icon"], [data-e2e="nav-profile"] img');
  
  // 3. Cek apakah ada tombol "Log in" dengan teks (Fallback)
  const hasLoginText = Array.from(document.querySelectorAll('button, a')).some(el => {
    const txt = el.textContent?.toLowerCase() || '';
    return txt === 'log in' || txt === 'masuk';
  });

  // Jika ada tombol login DAN tidak ada icon profil user, berarti fiks belum login
  if ((loginBtn || hasLoginText) && !profileIcon) {
    console.log("Detecting Logged Out state...");
    return false;
  }

  // Jika di halaman /foryou atau / tapi ga ada profile icon, kemungkinan besar guest mode
  if ((window.location.pathname === '/' || window.location.pathname === '/foryou') && !profileIcon) {
    return false;
  }

  return true;
};

const checkIfMyProfile = async (): Promise<boolean> => {
  // Tunggu maksimal 10 detik untuk tombol Edit Profile muncul
  for (let i = 0; i < 20; i++) {
    // TikTok menggunakan selector: data-e2e="edit-profile-entrance" atau "edit-profile-button"
    const isMyProfile = !!document.querySelector('[data-e2e="edit-profile-entrance"]') || 
                        !!document.querySelector('[data-e2e="edit-profile-button"]') || 
                        !!Array.from(document.querySelectorAll('button')).find(b => {
                          const txt = b.textContent?.toLowerCase() || '';
                          return txt.includes('edit profile') || txt.includes('edit profil') || txt.includes('promosikan') || txt.includes('promote post');
                        });
    
    if (isMyProfile) return true;
    
    // Jika path-nya bukan profil (misal di Home atau Explore), jangan polling lama-lama
    const path = window.location.pathname;
    const isKnownNonProfile = path === '/' || path.startsWith('/explore') || path.startsWith('/foryou') || path.startsWith('/search');
    
    if (isKnownNonProfile && !path.includes('/profile')) {
      // Re-verify login status
      if (!checkLogin()) return false;
    }
    
    await sleep(500); // Poll every 500ms
  }
  return false;
};

const findLikeButton = (): HTMLElement | null => {
  // Coba selector utama dulu (browse mode / modal), lalu fallback
  return (document.querySelector(SELECTORS.LIKE_ICON) || 
          document.querySelector(SELECTORS.LIKE_ICON_ALT)) as HTMLElement;
};

const findFavoriteButton = (): HTMLElement | null => {
  // 1. Coba selector resmi
  const primary = document.querySelector(SELECTORS.FAVORITE_ICON);
  if (primary) return primary as HTMLElement;
  
  // 2. Scan semua button di layar (Terutama area action bar kanan)
  // Cara paling ampuh: cari button yang mengandung icon kuning (karena yellow = favorited)
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const html = btn.innerHTML.toLowerCase();
    // Cek apakah ada warna kuning favorit di dalam button ini
    // #face15 atau rgb(250, 206, 21)
    if (html.includes('#face15') || html.includes('250, 206, 21')) {
      return btn as HTMLElement;
    }
    
    // Cek computed style dari SVG di dalam button
    const svg = btn.querySelector('svg');
    if (svg) {
      const color = window.getComputedStyle(svg).color;
      if (color === 'rgb(250, 206, 21)') return btn as HTMLElement;
      
      const paths = svg.querySelectorAll('path');
      for (const p of paths) {
        const fill = p.getAttribute('fill')?.toLowerCase() || '';
        if (fill === '#face15' || fill === 'rgb(250, 206, 21)') return btn as HTMLElement;
      }
    }
  }

  // 3. Fallback: pakai selector 'undefined-icon' tapi ambil yang posisinya kemungkinan favorite (icon ke-3)
  const undefinedIcons = document.querySelectorAll(SELECTORS.FAVORITE_ICON_ALT);
  if (undefinedIcons.length >= 3) {
    // Biasanya urutannya: Like, Comment, Favorite, Share
    return undefinedIcons[2] as HTMLElement;
  }

  return document.querySelector('button[aria-label*="Favorite"], button[aria-label*="favorit"]') as HTMLElement;
};

const findNextVideoButton = (): HTMLElement | null => {
  return (document.querySelector(SELECTORS.NEXT_VIDEO) || 
          document.querySelector(SELECTORS.NEXT_VIDEO_ALT) ||
          document.querySelector(SELECTORS.NEXT_VIDEO_ALT2)) as HTMLElement;
};

// Deteksi apakah tombol sedang dalam status AKTIF (merah / kuning)
const isElementActive = (element: HTMLElement): boolean => {
  // Cari parent button yang membungkus icon
  const parentBtn = element.closest('button') || element;
  const html = parentBtn.innerHTML.toLowerCase();
  
  // Cek warna SVG fill
  for (const color of Object.values(ACTIVE_COLORS)) {
    if (html.includes(color.toLowerCase())) return true;
  }
  
  // Cek atribut aria-pressed
  if (parentBtn.getAttribute('aria-pressed') === 'true') return true;
  
  // Cek computed style warna (paling akurat)
  const svgEl = parentBtn.querySelector('svg');
  if (svgEl) {
    const computedColor = window.getComputedStyle(svgEl).color;
    if (computedColor === ACTIVE_COLORS.LIKE_RED || computedColor === ACTIVE_COLORS.FAV_YELLOW) {
      return true;
    }
    // Cek fill attribute di path
    const paths = svgEl.querySelectorAll('path');
    for (const path of paths) {
      const fill = path.getAttribute('fill') || '';
      if (fill === ACTIVE_COLORS.LIKE_RED || fill === ACTIVE_COLORS.LIKE_RED_HEX || 
          fill === ACTIVE_COLORS.FAV_YELLOW || fill === ACTIVE_COLORS.FAV_YELLOW_HEX) {
        return true;
      }
    }
  }
  
  return false;
};

// Pindah ke video berikutnya (Klik tombol atau Keyboard Fallback)
const goToNextVideo = async (): Promise<boolean> => {
  const nextBtn = findNextVideoButton();
  if (nextBtn && !(nextBtn as HTMLButtonElement).disabled) {
    nextBtn.click();
    return true;
  }
  
  // Fallback: tekan keyboard ArrowDown
  console.log("Next button not found, using ArrowDown key fallback...");
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true,
  }));
  
  await randomSleep(1000, 2000);
  return !!findLikeButton();
};

// ==========================================
// NAVIGATION
// ==========================================

const navigateToProfileTab = async (tabSelector: string): Promise<boolean> => {
  // 1. Cek Login
  if (!checkLogin()) {
    // Hapus pending command biar ga infinite loop
    await chrome.storage.local.remove('pendingCommand');
    return false;
  }

  // 2. Pastikan di halaman profil SENDIRI
  const isMyProfile = await checkIfMyProfile();

  if (!isMyProfile) {
    console.log("Not on your own profile (or slow loading). Redirecting to your actual profile...");
    
    // Temukan fungsi mana yang manggil tab navigasi ini buat disimpen ke storage
    let cmd = '';
    if (tabSelector === SELECTORS.LIKED_TAB) cmd = 'unlike';
    if (tabSelector === SELECTORS.FAVORITES_TAB) cmd = 'unfavorite';
    if (tabSelector === SELECTORS.REPOST_TAB) cmd = 'unrepost';
    
    // Cek apakah kita sudah di mode redirect loop
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('botRedirect') === '1') {
       console.log("Redirect loop detected. Stopping.");
       await chrome.storage.local.remove('pendingCommand');
       alert("⚠️ Cannot find your profile. Please navigate to your profile manually.");
       return false;
    }
    
    if (cmd) {
      await chrome.storage.local.set({ pendingCommand: cmd });
    }

    // Tambahkan flag param untuk mencegah redirect loop
    const redirectUrl = new URL('https://www.tiktok.com/profile');
    redirectUrl.searchParams.set('botRedirect', '1');
    window.location.href = redirectUrl.toString();
    return false; 
  }

  // Tunggu sebentar biar page beneran load kalau baru pindah
  await sleep(2000);

  // 3. Klik tab yang dituju (pakai data-e2e selector yang sudah diverifikasi)
  console.log(`Clicking tab: ${tabSelector}`);
  let tab = document.querySelector(tabSelector) as HTMLElement;
  
  // Fallback khusus untuk tab Favorites (karena TikTok sering menghilangkan atribut data-e2e-nya)
  if (!tab && tabSelector.includes('favorite')) {
    console.log("Searching for Favorites tab via content/class...");
    const allTabs = Array.from(document.querySelectorAll('[role="tab"]'));
    tab = allTabs.find((el) => {
      const text = el.textContent?.toLowerCase() || '';
      const className = el.className || '';
      return text.includes('favorite') || text.includes('favorit') || (typeof className === 'string' && className.includes('Favorite'));
    }) as HTMLElement;
  }

  if (tab) {
    tab.click();
    await randomSleep(2000, 3500);
    console.log("Tab clicked successfully.");
  } else {
    console.log("Tab not found. It might be private or hasn't loaded yet.");
    alert(`⚠️ Liked/Favorites tab not found! Make sure the tab is not set to private.`);
    return false;
  }

  return true;
};

// Klik video pertama KHUSUS dari container grid yang sedang AKTIF (bukan dari tab lain)
const openFirstVideoInGrid = async (): Promise<boolean> => {
  // Cek apakah sudah di dalam video modal (tombol like visible)
  if (findLikeButton()) {
    console.log("Already inside the video modal. Proceeding.");
    return true;
  }

  // Tunggu grid loading
  await sleep(1500);
  
  // Cari video item dari container list yang aktif
  const videoList = document.querySelector(SELECTORS.VIDEO_LIST);
  if (videoList) {
    const firstItem = videoList.querySelector(`${SELECTORS.VIDEO_ITEM} a`) || videoList.querySelector('a');
    if (firstItem) {
      console.log("Clicking the first video from the active grid...");
      (firstItem as HTMLElement).click();
      await randomSleep(2500, 4000);
      
      // Verifikasi bahwa modal video sudah kebuka
      if (findLikeButton()) {
        console.log("Video modal is open. ✅");
        return true;
      }
    }
  }
  
  // Fallback: cari link video manapun yang visible
  const allVideoLinks = document.querySelectorAll('a[href*="/video/"]');
  for (const link of allVideoLinks) {
    const rect = (link as HTMLElement).getBoundingClientRect();
    // Hanya klik yang visible di viewport
    if (rect.top > 0 && rect.top < window.innerHeight && rect.width > 50) {
      console.log("Fallback: clicking any visible video link...");
      (link as HTMLElement).click();
      await randomSleep(2500, 4000);
      if (findLikeButton()) return true;
    }
  }

  return false;
};

// ==========================================
// CAPTCHA HANDLER (reusable)
// ==========================================
const handleCaptcha = async (): Promise<boolean> => {
  if (isCaptchaPresent()) {
    if (!isPaused) {
      isPaused = true;
      broadcastStatus();
      console.log("⚠️ Captcha Detected! Please solve it manually. The bot will continue automatically...");
    }
    await sleep(2000);
    return true; // masih ada captcha
  } else if (isPaused) {
    isPaused = false;
    broadcastStatus();
    console.log("✅ Captcha Solved! Continuing...");
    await randomSleep(2500, 4000);
  }
  return false; // tidak ada captcha
};

// ==========================================
// CORE BOT PROCESSES
// ==========================================

async function processAutoUnlike() {
  if (isRunning) {
    alert("Bot is already running! Stop it before starting a new one.");
    return;
  }
  
  isRunning = true;
  unlikeCount = 0;
  broadcastStatus();
  console.log("====== STARTING AUTO-UNLIKE ======");

  // 1. Navigate ke profile > Liked tab
  const reached = await navigateToProfileTab(SELECTORS.LIKED_TAB);
  if (!reached) {
    isRunning = false;
    broadcastStatus();
    return;
  }

  // 2. Buka video pertama dari grid Liked
  const opened = await openFirstVideoInGrid();
  if (!opened) {
    alert("⚠️ Cannot open the video. Try clicking one video in the Liked tab manually, then run the bot again.");
    isRunning = false;
    broadcastStatus();
    return;
  }

  // 3. Loop: Unlike > Next > Unlike > Next ...
  let failCount = 0;
  while (isRunning) {
    // Cek captcha
    if (await handleCaptcha()) continue;
    
    const likeBtn = findLikeButton();
    if (likeBtn) {
      failCount = 0; // reset
      if (isElementActive(likeBtn)) {
        // Klik parent button-nya langsung
        const clickTarget = likeBtn.closest('button') || likeBtn;
        console.log(`[${unlikeCount + 1}] ❤️ → 🤍 Removing Like!`);
        (clickTarget as HTMLElement).click();
        unlikeCount++;
        broadcastStatus();
        await randomSleep(1500, 3000);
      } else {
        console.log("This video is not liked. Proceeding...");
      }
    } else {
      failCount++;
      console.log(`Like button not found (attempt ${failCount}/5)...`);
      if (failCount >= 5) {
        console.log("Too many failures. Bot is stopping.");
        break;
      }
      await sleep(1500);
    }

    if (!isRunning) break;

    // Pindah video
    console.log("→ Moving to the next video...");
    const moved = await goToNextVideo();
    if (moved) {
      await randomSleep(2000, 4500);
    } else {
      console.log("Reached the end. Bot has finished!");
      alert(`✅ Bot Finished! Successfully unliked ${unlikeCount} videos.`);
      break;
    }
  }

  isRunning = false;
  broadcastStatus();
  console.log(`====== AUTO-UNLIKE FINISHED (${unlikeCount} videos) ======`);
}

async function processAutoUnfavorite() {
  if (isRunning) {
    alert("Bot is already running! Please stop it first.");
    return;
  }
  
  isRunning = true;
  unlikeCount = 0;
  broadcastStatus();
  console.log("====== STARTING AUTO-UNFAVORITE ======");

  const reached = await navigateToProfileTab(SELECTORS.FAVORITES_TAB);
  if (!reached) {
    isRunning = false;
    broadcastStatus();
    return;
  }

  const opened = await openFirstVideoInGrid();
  if (!opened) {
    alert("⚠️ Cannot open the video. Please click one video manually first.");
    isRunning = false;
    broadcastStatus();
    return;
  }

  let failCount = 0;
  while (isRunning) {
    if (await handleCaptcha()) continue;
    
    const favBtn = findFavoriteButton();
    if (favBtn) {
      failCount = 0;
      if (isElementActive(favBtn)) {
        const clickTarget = favBtn.closest('button') || favBtn;
        console.log(`[${unlikeCount + 1}] ⭐ → Removing Favorite!`);
        (clickTarget as HTMLElement).click();
        unlikeCount++;
        broadcastStatus();
        await randomSleep(1500, 3000);
      } else {
        console.log("This video is not favorited. Proceeding...");
      }
    } else {
      failCount++;
      console.log(`Favorite button not found (attempt ${failCount}/5)...`);
      if (failCount >= 5) break;
      await sleep(1500);
    }

    if (!isRunning) break;

    console.log("→ Moving to the next video...");
    const moved = await goToNextVideo();
    if (moved) {
      await randomSleep(2000, 4500);
    } else {
      alert(`✅ Bot Finished! Successfully unfavorited ${unlikeCount} videos.`);
      break;
    }
  }

  isRunning = false;
  broadcastStatus();
  console.log(`====== AUTO-UNFAVORITE FINISHED (${unlikeCount} videos) ======`);
}

async function processAutoUnrepost() {
  if (isRunning) {
    alert("Bot is already running! Please stop it first.");
    return;
  }
  
  isRunning = true;
  unlikeCount = 0;
  broadcastStatus();
  console.log("====== STARTING AUTO-UNREPOST ======");

  // 1. Navigate ke profile > Reposts tab
  const reached = await navigateToProfileTab(SELECTORS.REPOST_TAB);
  if (!reached) {
    isRunning = false;
    broadcastStatus();
    return;
  }

  // 2. Buka video pertama dari grid Reposts
  const opened = await openFirstVideoInGrid();
  if (!opened) {
    alert("⚠️ Cannot open reposted video. Try clicking one video in the Reposts tab manually, then run again.");
    isRunning = false;
    broadcastStatus();
    return;
  }

  // 3. Loop: Unrepost > Next > Unrepost > Next ...
  let failCount = 0;
  while (isRunning) {
    // Cek captcha
    if (await handleCaptcha()) continue;
    
    // Cari tombol repost
    const repostBtn = document.querySelector(SELECTORS.REPOST_ICON) as HTMLElement;
    
    if (repostBtn) {
      failCount = 0;
      
      // Cek apakah video ini memang sudah di-repost
      // Cara 1: cek aria-label
      const ariaLabel = repostBtn.getAttribute('aria-label')?.toLowerCase() || '';
      // Cara 2: cek keberadaan repost-tag "You reposted"
      const repostTag = document.querySelector(SELECTORS.REPOST_TAG);
      
      const isReposted = ariaLabel.includes('remove repost') || 
                          ariaLabel.includes('hapus repost') || 
                          !!repostTag;
      
      if (isReposted) {
        const clickTarget = repostBtn.closest('button') || repostBtn;
        console.log(`[${unlikeCount + 1}] 🔄 → Removing Repost!`);
        (clickTarget as HTMLElement).click();
        unlikeCount++;
        broadcastStatus();
        await randomSleep(1500, 3000);
      } else {
        console.log("This video is not a repost. Proceeding...");
      }
    } else {
      failCount++;
      console.log(`Repost button not found (attempt ${failCount}/5)...`);
      if (failCount >= 5) {
        console.log("Too many failures. Bot is stopping.");
        break;
      }
      await sleep(1500);
    }

    if (!isRunning) break;

    // Pindah video berikutnya
    console.log("→ Moving to the next video...");
    const moved = await goToNextVideo();
    if (moved) {
      await randomSleep(2000, 4500);
    } else {
      alert(`✅ Bot Finished! Successfully unreposted ${unlikeCount} videos.`);
      break;
    }
  }

  isRunning = false;
  broadcastStatus();
  console.log(`====== AUTO-UNREPOST FINISHED (${unlikeCount} videos) ======`);
}

async function processAutoUnfollow() {
  if (isRunning) {
    alert("Bot is already running! Please stop it first.");
    return;
  }
  
  isRunning = true;
  unlikeCount = 0;
  broadcastStatus();
  console.log("====== STARTING AUTO-UNFOLLOW ======");

  // 1. Pastikan di halaman profil sendiri
  if (!checkLogin()) {
    await chrome.storage.local.remove('pendingCommand');
    return;
  }

  const isMyProfile = await checkIfMyProfile();

  if (!isMyProfile) {
    console.log("Not on your own profile. Redirecting to /profile...");
    
    // Cegah redirect loop
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('botRedirect') === '1') {
       console.log("Redirect loop detected. Stopping.");
       await chrome.storage.local.remove('pendingCommand');
       alert("⚠️ Cannot find your profile. Please navigate to your profile manually.");
       return;
    }
    
    await chrome.storage.local.set({ pendingCommand: 'unfollow' });
    const redirectUrl = new URL('https://www.tiktok.com/profile');
    redirectUrl.searchParams.set('botRedirect', '1');
    window.location.href = redirectUrl.toString();
    return;
  }

  // 2. Klik "Following" count di header profil
  // Selector [data-e2e="following-count"] itu element <strong> yang berisi angka (misal "1079")
  // Klik element ini langsung membuka modal Following list
  console.log("Searching for Following count in profile header...");
  const followingCount = document.querySelector('[data-e2e="following-count"]') as HTMLElement;
  
  if (!followingCount) {
    alert("⚠️ Following count not found! Make sure you are on your own profile page.");
    isRunning = false;
    broadcastStatus();
    return;
  }
  
  console.log("Clicking Following count...");
  followingCount.click();
  await randomSleep(2000, 3500);

  // 3. Verifikasi modal terbuka
  let modal = document.querySelector('[role="dialog"]');
  if (!modal) {
    // Coba klik lagi
    console.log("Modal is not open yet, trying to click again...");
    followingCount.click();
    await randomSleep(2000, 3000);
    modal = document.querySelector('[role="dialog"]');
  }
  
  if (!modal) {
    alert("⚠️ Following list modal did not open. Try clicking the Following count manually, then run again.");
    isRunning = false;
    broadcastStatus();
    return;
  }
  console.log("✅ Following list modal is open!");

  // 4. Cari scrollable container di modal
  const findScrollContainer = (): HTMLElement | null => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;
    const allDivs = dlg.querySelectorAll('div');
    for (const div of allDivs) {
      if (div.scrollHeight > div.clientHeight && div.clientHeight > 100) {
        return div as HTMLElement;
      }
    }
    return null;
  };

  const scrollContainer = findScrollContainer();
  if (!scrollContainer) {
    console.log("⚠️ Scroll container not found in modal, trying to proceed anyway...");
  }

  // 5. Loop: Cari tombol "Following"/"Friends" via data-e2e="follow-button" → klik → scroll
  let noNewButtonsCount = 0;
  const MAX_NO_NEW = 8; // Naikin limit biar bot lebih sabar nunggu loading data baru
  
  while (isRunning) {
    if (await handleCaptcha()) continue;

    // Cari SATU tombol unfollow yang valid & belum di-klik
    const followButtons = Array.from(document.querySelectorAll('button[data-e2e="follow-button"]'));
    let targetBtn: HTMLElement | null = null;
    let btnText = '';
    
    for (const btn of followButtons) {
      if (!isRunning) break;
      
      const text = btn.textContent?.trim() || '';
      
      // Hanya pilih yang bertuliskan "Following" atau "Friends"
      // data-bot-clicked mencegah infinite loop kalau ada network error/rate limit
      if ((text === 'Following' || text === 'Friends') && !btn.hasAttribute('data-bot-clicked')) {
        const rect = btn.getBoundingClientRect();
        // Pastikan element kelihatan di layar (gak hidden)
        if (rect.top > 0 && rect.top < window.innerHeight && rect.width > 0) {
          targetBtn = btn as HTMLElement;
          btnText = text;
          break; // Cukup ambil 1 aja, click, lalu biarin React nge-render ulang list-nya
        }
      }
    }

    if (!isRunning) break;

    if (targetBtn) {
      noNewButtonsCount = 0; // Reset counter karena berhasil nemu tombol
      
      // Kasih flag biar ga kepencet 2x kalau request nyangkut
      targetBtn.setAttribute('data-bot-clicked', 'true');
      
      // Scroll sedikit biar tombolnya pas di tengah viewport (lebih natural)
      targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);
      
      console.log(`[${unlikeCount + 1}] 🚫 Unfollowing: ${btnText}`);
      targetBtn.click();
      unlikeCount++;
      broadcastStatus();
      
      // Sangat penting: tunggu React nge-render DOM yang baru (detach element lama dan pasang "Follow")
      await randomSleep(1000, 2000);
      
    } else {
      // Kalau ga ada tombol "Following" di layar (mungkin semuanya udah item Abu-abu/Merah "Follow")
      // Kita harus maksa scroll ke bawah list-nya buat load data API baru
      if (followButtons.length > 0) {
        const lastButton = followButtons[followButtons.length - 1];
        // Pake block: 'start' bakal narik button paling bawah ke ATAS layar. Ini maksa list-nya scroll pol-polan
        lastButton.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log("Scrolling down to load new users...");
        await randomSleep(2000, 3500); // Tunggu agak lama buat Network Request loading datanya
        noNewButtonsCount++;
      } else {
        noNewButtonsCount++;
        await sleep(1500);
      }
    }

    // Kalau udah ngoscroll ampe 8x berturut-turut tetep ga ada muncul user baru
    if (noNewButtonsCount >= MAX_NO_NEW) {
      console.log("No more Following/Friends buttons found. Bot has finished!");
      alert(`✅ Bot Finished! Successfully unfollowed ${unlikeCount} accounts.`);
      break;
    }
  }

  // Tutup modal (klik area di luar modal)
  const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] [data-e2e="modal-close-inner-button"]') as HTMLElement;
  if (closeBtn) closeBtn.click();

  isRunning = false;
  broadcastStatus();
  console.log(`====== AUTO-UNFOLLOW FINISHED (${unlikeCount} accounts) ======`);
}

// ==========================================
// MESSAGE LISTENER
// ==========================================

chrome.runtime.onMessage.addListener((message: any, _: any, sendResponse: any) => {
  if (message.command === 'status') {
    sendResponse({ isRunning, isPaused, unlikeCount });
  } else if (message.command === 'unlike') {
    processAutoUnlike();
    sendResponse({ status: 'started' });
  } else if (message.command === 'unfavorite') {
    processAutoUnfavorite();
    sendResponse({ status: 'started' });
  } else if (message.command === 'unrepost') {
    processAutoUnrepost();
    sendResponse({ status: 'started' });
  } else if (message.command === 'unfollow') {
    processAutoUnfollow();
    sendResponse({ status: 'started' });
  } else if (message.command === 'stop') {
    isRunning = false;
    isPaused = false;
    broadcastStatus();
    console.log("⛔ Bot forcefully stopped.");
    sendResponse({ status: 'stopped' });
  }
  return true;
});

// ==========================================
// AUTO-EXECUTE ON PAGE LOAD
// ==========================================
(async () => {
  await sleep(2500); 
  const result = await chrome.storage.local.get('pendingCommand');
  if (result.pendingCommand) {
    const cmd = result.pendingCommand;

    // VALIDASI LOGIN: Jika tidak login, hapus command dan stop loop
    if (!checkLogin()) {
      console.log("No active login detected. Clearing pending command to avoid loop.");
      await chrome.storage.local.remove('pendingCommand');
      alert("⚠️ Please log in to your TikTok account first!");
      return;
    }

    console.log(`📨 Auto-executing pending command: ${cmd}`);
    await chrome.storage.local.remove('pendingCommand');
    
    if (cmd === 'unlike') processAutoUnlike();
    else if (cmd === 'unfavorite') processAutoUnfavorite();
    else if (cmd === 'unrepost') processAutoUnrepost();
    else if (cmd === 'unfollow') processAutoUnfollow();
  }
})();
