import React, { useState, useEffect } from 'react';

const App: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTask, setCurrentTask] = useState('Ready');
  const [processedCount, setProcessedCount] = useState(0);

  useEffect(() => {
    // Cek status saat popup di buka
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0].url?.includes('tiktok.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { command: 'status' }, (response) => {
          if (!chrome.runtime.lastError && response) {
            setIsRunning(response.isRunning);
            if (response.isRunning) setCurrentTask('Bot is running ⚡');
          }
        });
      } else if (!tabs[0]?.url?.includes('tiktok.com')) {
        setCurrentTask('Not on TikTok ❌');
      }
    });

    // Dengarkan update saat bot berhenti otomatis dari script
    const listener = (msg: any) => {
      if (msg.event === 'status_update') {
        setIsRunning(msg.isRunning);
        if (msg.unlikeCount !== undefined) setProcessedCount(msg.unlikeCount);
        if (msg.isPaused) {
           setCurrentTask('⚠️ Captcha: Solve Puzzle Manually!');
        } else if (!msg.isRunning) {
           setCurrentTask('Ready');
        } else {
           setCurrentTask('Bot is running ⚡');
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const sendCommand = (action: string) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (action === 'stop') {
        // Stop ga perlu reload
        if (tabs[0]?.id && tabs[0].url?.includes('tiktok.com')) {
          chrome.tabs.sendMessage(tabs[0].id, { command: 'stop' }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
        setIsRunning(false);
        setCurrentTask('Ready');
        return;
      }

      // Untuk semua command lain: simpan command ke storage, lalu REDIRECT ke profile
      // Ini menjamin bot selalu mulai dari halaman profil yang bener.
      chrome.storage.local.set({ pendingCommand: action }, () => {
        if (tabs[0]?.id && tabs[0].url?.includes('tiktok.com')) {
          console.log(`Setting pending command '${action}' and redirecting...`);
          // Gunakan /profile karena /@me ternyata mengarah ke akun orang beneran wkwk
          chrome.tabs.update(tabs[0].id, { url: "https://www.tiktok.com/profile" });
        } else {
          // Jika tidak ada tab aktif, buka tab baru ke tiktok
          chrome.tabs.create({ url: "https://www.tiktok.com/profile" });
        }
        setIsRunning(true);
        setCurrentTask('Bot is running ⚡');
        setProcessedCount(0);
      });
    });
  };

  return (
    <div className="w-80 p-5 bg-[#0e0e11] text-white font-sans rounded-xl border border-gray-800 shadow-2xl">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
        <div className="bg-gradient-to-r from-pink-500 to-violet-500 p-2 rounded-lg">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500">
            TikTok Cleaner
          </h1>
          <p className="text-xs text-gray-400">by aji • Pro Version</p>
        </div>
      </div>

      {!isRunning ? (
        <div className="space-y-3">
          <button
            onClick={() => sendCommand('unlike')}
            className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 p-3 rounded-lg border border-gray-700 transition-all group"
          >
            <span className="font-semibold text-gray-200 group-hover:text-pink-400">🧹 Auto Unlike</span>
          </button>
          
          <button
            onClick={() => sendCommand('unfavorite')}
            className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 p-3 rounded-lg border border-gray-700 transition-all group"
          >
            <span className="font-semibold text-gray-200 group-hover:text-yellow-400">🗑️ Auto Unfavorite</span>
          </button>

          <button
            onClick={() => sendCommand('unrepost')}
            className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 p-3 rounded-lg border border-gray-700 transition-all group"
          >
            <span className="font-semibold text-gray-200 group-hover:text-blue-400">🔄 Auto Unrepost</span>
          </button>

          <button
            onClick={() => sendCommand('unfollow')}
            className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 p-3 rounded-lg border border-gray-700 transition-all group"
          >
            <span className="font-semibold text-gray-200 group-hover:text-red-400">🚫 Auto Unfollow</span>
          </button>
        </div>
      ) : (
        <div className="py-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-gray-300 mb-2">Bot is clicking around...</p>
          <p className="text-2xl font-bold text-pink-400 mb-6">{processedCount} <span className="text-sm text-gray-400">processed</span></p>
          <button
            onClick={() => sendCommand('stop')}
            className="w-full flex items-center justify-center bg-red-900/50 hover:bg-red-800 text-red-200 p-3 rounded-lg border border-red-700 transition-all"
          >
            <span className="font-bold">⛔ STOP BOT NOW</span>
          </button>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-800">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Status: <span className={isRunning ? "text-yellow-400 font-bold" : "text-green-400"}>{currentTask}</span></span>
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default App;
