# RedAltSync

A web application that helps synchronize subreddit subscriptions between Reddit accounts.

🛠️ Built with Cursor AI, guided by vibes!

## Features

- OAuth2 authentication with Reddit
- Subreddit subscription synchronization
- Health check endpoint

## Prerequisites

- Go 1.21 or later
- Reddit API credentials

## Setting Up Reddit API Credentials

1. Go to https://www.reddit.com/prefs/apps
2. Click "Create another app..." at the bottom
3. Fill in the following details:
   - Name: RedAltSync
   - Type: Web app
   - Description: Sync subreddit subscriptions between Reddit accounts
   - About URL: (your website URL or GitHub repo)
   - Redirect URI: http://localhost:3000/auth/callback (for development)
4. Click "Create app"
5. Note your client ID (under the app name) and client secret

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_REDIRECT_URI=http://localhost:3000/auth/callback
```

## Installation

## Running the Application

To start the server, run:
```bash
go run main.go
```

To start the server with live reload, run:
```bash
go install github.com/air-verse/air@latest
air
```

The server will start on `http://localhost:3000`
