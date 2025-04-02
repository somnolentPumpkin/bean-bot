const tmi = require("tmi.js");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config({ path: "beth.env" });

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
        client.say(channel, (`@${username} Beth Points are arbitrary points that serve no useful purpose. I'll give them out whenever I feel like it (like if someone does something nice for me, or makes me laugh). I might also take them away if it'd be funny at the time. Check your balance with !bp or see the top five leaderboard with !bptop.`))
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
    },
    /*vpm: () => {
        client.say(channel, `@${username} Virtual Pet Monster is the tamagotchi thing on the side of your screen. Available commands: !feed !heal !clean`)
    }*/
  };

  if (commands[command]) commands[command]();
});
