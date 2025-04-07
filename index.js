const tmi = require("tmi.js");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
require("dotenv").config({ path: "beth.env" });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const db = new sqlite3.Database("bethpoints.db", (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite database.");
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  points INTEGER DEFAULT 0
)`);

const client = new tmi.Client({
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_PASSWORD,
  },
  channels: [process.env.TWITCH_CHANNEL],
});

client.connect().then(() => console.log("Connected to Twitch chat."));

function addPoints(username, amount, callback) {
  db.run("UPDATE users SET points = points + ? WHERE username = ?", [amount, username], function (err) {
    if (err) console.error(err);
    if (callback) callback(err);
  });
}

function removePoints(username, amount, callback) {
  db.run("UPDATE users SET points = points - ? WHERE username = ?", [amount, username], function (err) {
    if (err) console.error(err);
    if (callback) callback(err);
  });
}

client.on("message", async (channel, userState, message, self) => {
  if (self) return;
  const username = userState.username.toLowerCase();
  
  db.run(
    "INSERT OR IGNORE INTO users (username, points) VALUES (?, 0)",
    [username]
  );

  if (!message.startsWith("!")) return;
  const [command, ...args] = message.slice(1).split(" ");

  const commands = {
    bp: () => {
      db.get("SELECT points FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
          console.error(err);
        } else {
          const points = row && row.points !== null ? row.points : 0;
          client.say(channel, `@${username}, you have ${points} Beth Points.`);
        }
      });
    },
    bptop: () => {
      db.all("SELECT username, points FROM users ORDER BY points DESC LIMIT 5", [], (err, rows) => {
        if (err) {
          console.error(err);
          return;
        }
        const leaderboard = rows.map((row, i) => `${i + 1}. ${row.username}: ${row.points}`).join(" | ");
        client.say(channel, `Beth Points Top: | ${leaderboard || "No data yet."}`);
      });
    },
    bethpoints: () => {
      client.say(channel, `@${username} At random points during the stream, Beth may choose to spawn a resource. Use !mine to break rocks, or !chop to chop trees. The resources you collect earn you Beth Points. Check your balance with !bp or see the top five leaderboard with !bptop.`);
    },
    bpadd: () => {
      if (username !== "elizibeth") return;
      const targetUser = args[0].toLowerCase();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount)) return;
      addPoints(targetUser, amount, (err) => {
        if (!err) client.say(channel, `@${targetUser}, received ${amount} Beth Points.`);
      });
    },
    bpremove: () => {
      if (username !== "elizibeth") return;
      const targetUser = args[0].toLowerCase();
      const amount = parseInt(args[1], 10);
      if (!targetUser || isNaN(amount)) return;
      removePoints(targetUser, amount, (err) => {
        if (!err) client.say(channel, `@${targetUser}, lost ${amount} Beth Points.`);
      });
    }
  };

  if (commands[command]) commands[command]();
});

// Express endpoint to handle game events
app.post("/event", (req, res) => {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", () => {
    console.log("Received raw data:", body || "[no data]");

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      console.error("JSON parse error:", err.message);
      return res.status(400).send("Invalid JSON");
    }

    const { event, username, amount } = parsed;

    if (!event || !username || typeof amount !== "number") {
      return res.status(400).send("Missing or invalid fields");
    }

    if (event === "mine") {
      addPoints(username, amount, (err) => {
        if (err) return res.status(500).send("DB error");
        client.say(process.env.TWITCH_CHANNEL, `@${username} mined a rock and earned ${amount} Beth Point(s)!`);
        res.send("Points added");
      });
    } else if (event === "chop") {
      addPoints(username, amount, (err) => {
        if (err) return res.status(500).send("DB error");
        client.say(process.env.TWITCH_CHANNEL, `@${username} chopped a tree and earned ${amount} Beth Point(s)!`);
        res.send("Points added");
      });
    }else {
      res.status(400).send("Unknown event");
    }
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
