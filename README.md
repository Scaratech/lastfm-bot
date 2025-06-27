# LastFM Bot
A simple API for spoofing last.fm scrobbles of your currently playing song 

## Building
Dependencies: `git`, `nodejs`, `pnpm`/`npm`
```sh
$ git clone https://github.com/scaratech/lastfm-bot
$ cd lastfm-bot
$ pnpm i
$ pnpm build
```

## Configuration
See: `.env.example`

## Creating an API Account
You can put anything in any of the fields just make sure:
- For "Callback URL" put: `http://localhost:3000/callback`
- (I don't know if this is required) Put `http://localhost:3000` for the "Application homepage"

## Usage
```sh
$ pnpm start
# Visit: http://localhost:3000/auth in your browser
# After you've been authenticated, visit `http://localhost:3000/spoof/start` to start spoofing scrobbles
# Due to API rate-limiting, you can only scrobble 5 times a second, with a limit of 2800 scrobbles a day
# To stop, visit `http://localhost:3000/spoof/stop`
```
