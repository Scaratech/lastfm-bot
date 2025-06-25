import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import session from "express-session";
import axios from "axios";
import crypto from "crypto";

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const USERNAME = process.env.USERNAME;
const PORT = process.env.PORT || 3000;

if (!API_KEY || !API_SECRET || !SESSION_SECRET || !USERNAME) {
    console.error("Missing a value in .env, see .env.example for reference");
    process.exit(1);
}

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const app = express();

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

interface LastFmSession {
    sessionKey: string;
    username: string;
}

declare module "express-session" {
    interface SessionData {
        lastfm?: LastFmSession;
    }
}

function genApiSig(params: Record<string, string>): string {
    const keys = Object.keys(params)
        .filter((k) => k !== "format" && k !== "callback")
        .sort();
    let sig = "";

    for (const key of keys) {
        sig += key + params[key];
    }

    sig += API_SECRET;
    return crypto.createHash("md5").update(sig).digest("hex");
}

app.get("/auth", (req: Request, res: Response) => {
    const callback = `${req.protocol}://${req.get("host")}/callback`;
    const auth = `http://www.last.fm/api/auth/?api_key=${API_KEY}&cb=${encodeURIComponent(callback)}`;

    res.redirect(auth);
});


app.get("/callback", async (req, res): Promise<any> => {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(400).send("Missing token");

    const params = {
        method: "auth.getSession",
        api_key: API_KEY,
        token,
    };
    const sig = genApiSig(params);

    try {
        const bodyParams = {
            ...params,
            api_sig: sig,
            format: "json",
        };
        const response = await axios.post(
            LASTFM_API,
            new URLSearchParams(bodyParams).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        const sessionKey = response.data.session?.key;
        const username = response.data.session?.name;

        if (!sessionKey || !username) return res.status(400).send("Failed to get session key");

        req.session.lastfm = { sessionKey, username };

        res.status(200).send(`Authenticated as ${username}`);
    } catch (error) {
        console.error("Error getting session key:", error.response?.data || error);
        res.status(500).send("Failed to get session key");
    }
});

interface TrackInfo {
    artist: string;
    track: string;
    album: string;
}

async function getSong(sessionKey: string): Promise<TrackInfo | null> {
    try {
        const res = await axios.get(LASTFM_API, {
            params: {
                method: "user.getrecenttracks",
                api_key: API_KEY,
                sk: sessionKey,
                format: "json",
                limit: 1,
            },
        });

        const track = res.data.recenttracks?.track?.[0];

        if (
            track &&
            (track["@attr"]?.nowplaying === "true" || track.date === undefined)
        ) {
            return {
                artist: track.artist["#text"],
                track: track.name,
                album: track.album["#text"] || "",
            };
        }

        return null;
    } catch (error) {
        console.error("Error fetching current playing track:", error);
        return null;
    }
}

async function scrobble(
    sessionKey: string,
    track: TrackInfo,
    timestamp: number
): Promise<any> {
    const method = "track.scrobble";
    const params = {
        method,
        api_key: API_KEY,
        sk: sessionKey,
        "artist[0]": track.artist,
        "track[0]": track.track,
        "album[0]": track.album || "",
        "timestamp[0]": timestamp.toString(),
    };
    //@ts-ignore
    const api_sig = genApiSig(params);
    const bodyParams = {
        ...params,
        api_sig,
        format: "json",
    };

    try {
        const res = await axios.post(
            LASTFM_API,
            //@ts-ignore
            new URLSearchParams(bodyParams).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        return res.data;
    } catch (err: any) {
        console.error("Error scrobbling:", err.response?.data || err.message || err);
        return null;
    }
}

const spoofIntervals: Record<string, NodeJS.Timeout> = {};

app.get("/spoof/start", async (req: Request, res: Response): Promise<any> => {
    if (!req.session.lastfm || req.session.lastfm.username !== USERNAME) return res.status(401).send(`You are not authenticated. Please authenticate first at /auth`)
    const sessionKey = req.session.lastfm.sessionKey;

    if (spoofIntervals[USERNAME]) {
        clearInterval(spoofIntervals[USERNAME]);
        delete spoofIntervals[USERNAME];
    }

    spoofIntervals[USERNAME] = setInterval(async () => {
        const currentTrack = await getSong(sessionKey);

        if (!currentTrack) {
            console.log(`[${USERNAME}] No currently playing track found`);
            return;
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const result = await scrobble(sessionKey, currentTrack, timestamp);

        if (result && !result.error) {
            console.log(
                `[${USERNAME}] Scrobbled: ${currentTrack.artist} - ${currentTrack.track}`
            );
        } else {
            console.error(`[${USERNAME}] Failed to scrobble`, result);
        }
    }, 200);

    res.status(200).send(`Started spoofing plays for user ${USERNAME} 5 times per second.`);
});

app.get("/spoof/stop", (_req: Request, res: Response): any => {
    if (spoofIntervals[USERNAME]) {
        clearInterval(spoofIntervals[USERNAME]);
        delete spoofIntervals[USERNAME];

        console.log(`[${USERNAME}] Spoofing stopped`);
        return res.status(200).send(`Stopped spoofing plays for user ${USERNAME}.`);
    } else {
        return res.status(404).send(`No active spoofing found for user ${USERNAME}.`);
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
});
