# 🧹 TikTok Cleaner Pro

A powerful and automated Chrome Extension designed to help you declutter your TikTok account by bulk-removing likes, favorites, reposts, and unfollowing users with a single click.

![TikTok Cleaner UI](./assets/screenshots/tiktok_cleaner_ui.png)
*Automated TikTok cleaning in action*

![TikTok Cleaner Menu](./assets/screenshots/tiktok_cleaner_menu.png)
*Simple and intuitive feature menu*

![TikTok Cleaner Processing](./assets/screenshots/tiktok_cleaner_processing.png)
*Real-time processing count and safety controls*

## 🚀 Features

- **❤️ Auto Unlike**: Automatically scrolls through your "Liked" tab and removes likes.
- **⭐ Auto Unfavorite**: Cleans up your "Favorites" collection seamlessly.
- **🔄 Auto Unrepost**: Quickly removes videos you've reposted.
- **🚫 Auto Unfollow**: Bulk unfollows accounts from your "Following" list.
- **🛡️ Smart Safety**: Includes built-in delays, captcha detection, and login verification to prevent account flags.
- **🌐 Universal Language**: Fully translated to English for a seamless global experience.

## 🛠️ How It Works

The bot uses advanced DOM selectors and automated navigation to strictly interact with your own profile. 
1. **Validation**: It verifies you are logged in and on your own profile before starting.
2. **Navigation**: Automatically redirects to the correct profile tab (Liked, Favorites, etc.).
3. **Execution**: Iteratively processes items with randomized delays to mimic human behavior.
4. **Safety**: Pauses automatically if a Captcha is detected.

## 📦 Installation

To use this extension in your browser:

1. **Clone or Download** this repository to your local machine.
2. Run the build command:
   ```bash
   yarn install
   yarn build
   ```
3. Open Chrome and go to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the `dist` folder generated inside this project directory.

## 💻 Tech Stack

- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Vanilla CSS / [Tailwind CSS](https://tailwindcss.com/)
- **API**: Chrome Extension API (v3)

## 🏗️ Development

If you want to modify the code:

```bash
# Install dependencies
yarn install

# Run build in watch mode (requires manual refresh of extension in Chrome)
yarn dev
# or
yarn build
```

## ⚠️ Disclaimer

This tool is for personal use only. Use it responsibly and at your own risk. Excessive automated actions on social media platforms may result in temporary restrictions on your account. The developers are not responsible for any misuse or account issues arising from the use of this software.

---
Created with ❤️ by **aji**
