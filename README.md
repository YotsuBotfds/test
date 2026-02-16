# Local Test Server

A simple Express.js server for local testing of static files and basic APIs.

## Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed
2. Navigate to this directory in your terminal
3. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

Start the server with:
```bash
npm start
```

The server will run at `http://localhost:3000`

## Project Structure

```
.
├── server.js          # Express server configuration
├── package.json       # Dependencies
├── public/            # Static files (HTML, CSS, JS)
│   └── index.html    # Main HTML file
└── README.md         # This file
```

## Features

- ✅ Serves static files (HTML, CSS, JS, images, etc.) from the `public/` directory
- ✅ JSON parsing for API requests
- ✅ Health check endpoint at `/api/health`
- ✅ Automatic routing to `index.html` for SPA support
- ✅ Graceful shutdown with Ctrl+C

## Example Usage

1. Create a `public` directory:
   ```bash
   mkdir public
   ```

2. Add your HTML, CSS, and JavaScript files to the `public` directory

3. Start the server:
   ```bash
   npm start
   ```

4. Visit `http://localhost:3000` in your browser

## API Endpoints

- `GET /api/health` - Returns server status
  ```json
  { "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
  ```

## Stopping the Server

Press `Ctrl+C` in your terminal to stop the server.
