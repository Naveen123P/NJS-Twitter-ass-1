// const express = require("express")
// const app = express()
// app.use(express.json())
// module.exports = app
// const {open} = require("sqlite")
// const sqlite3 = require("sqlite3")
// const path = require("path")
// const dbPath = path.join(__dirname, "twitterClone.db")
// let db;

// const initilizeDbAndServer = async () => {
//     try{
//         db = await open({
//             filename : dbPath,
//             driver : sqlite3.Database,
//         })
//         app.listen(3000,() => {
//             console.log("Server is running http://localhost:30000")
//         })
//     }catch(e){
//         console.log(`Db Error: ${e.message}`)
//         process.exit(1)
//     }
// }

// initilizeDbAndServer()

// // API 1

// app.post("/register/", async (req, res) => {
//     const {id,username, password, name, gender} = req.body 
//     const isUserExistsQuery = `Select username From user Where username = ${username};`
//     console.log("Hello World!")
//     const isUserExistsResult = await db.get(isUserExistsQuery)
//     console.log(isUserExistsResult)
//     if (isUserExistsQuery.length === 0){
//         res.status(400).send("User already exists")
//     }else{
//         if(password.length < 6){
//             res.status(400).send("Password id too short")
//         }else{
//             const addUserQuery = `
//             INSERT INTO 
//                 user(user_id, name, username, password, gender)
//             values(
//                 ${id},
//                 ${name}
//                 ${username},
//                 ${password},
//                 ${gender}
//             ) ;`
//             const addUserResult = await db.run(addUserQuery)
//             res.status(200).send("User created successfully")
//         }
        
//     }
// })

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const db = new sqlite3.Database('twitterClone.db');
const SECRET_KEY = 'your_secret_key';

app.use(bodyParser.json());

// Middleware for JWT authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).send('Invalid JWT Token');

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(401).send('Invalid JWT Token');
        req.user = user;
        next();
    });
};

// API 1: Register
app.post('/register', (req, res) => {
    const { username, password, name, gender } = req.body;
    if (password.length < 6) {
        return res.status(400).send('Password is too short');
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = 'INSERT INTO user (username, password, name, gender) VALUES (?, ?, ?, ?)';

    db.get('SELECT * FROM user WHERE username = ?', [username], (err, row) => {
        if (row) {
            return res.status(400).send('User already exists');
        }
        db.run(query, [username, hashedPassword, name, gender], function (err) {
            if (err) {
                return res.status(500).send('Server error');
            }
            res.status(200).send('User created successfully');
        });
    });
});

// API 2: Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM user WHERE username = ?';

    db.get(query, [username], (err, row) => {
        if (!row) {
            return res.status(400).send('Invalid user');
        }
        const validPassword = bcrypt.compareSync(password, row.password);
        if (!validPassword) {
            return res.status(400).send('Invalid password');
        }
        const token = jwt.sign({ userId: row.user_id }, SECRET_KEY);
        res.status(200).json({ jwtToken: token });
    });
});

// API 3: Get User Feed
app.get('/user/tweets/feed', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const query = `
        SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM tweet
        JOIN follower ON tweet.user_id = follower.following_user_id
        JOIN user ON user.user_id = tweet.user_id
        WHERE follower.follower_user_id = ?
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;

    db.all(query, [userId], (err, rows) => {
        res.json(rows);
    });
});

// API 4: Get Following
app.get('/user/following', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const query = `
        SELECT user.name
        FROM follower
        JOIN user ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ?;
    `;

    db.all(query, [userId], (err, rows) => {
        res.json(rows);
    });
});

// API 5: Get Followers
app.get('/user/followers', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const query = `
        SELECT user.name
        FROM follower
        JOIN user ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = ?;
    `;

    db.all(query, [userId], (err, rows) => {
        res.json(rows);
    });
});

// API 6: Get Tweet by ID
app.get('/tweets/:tweetId', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const tweetId = req.params.tweetId;

    const query = `
        SELECT tweet.tweet, tweet.date_time AS dateTime,
            (SELECT COUNT(*) FROM like WHERE tweet_id = ?) AS likes,
            (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies
        FROM tweet
        JOIN follower ON tweet.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ? AND tweet.tweet_id = ?;
    `;

    db.get(query, [tweetId, tweetId, userId, tweetId], (err, row) => {
        if (!row) {
            return res.status(401).send('Invalid Request');
        }
        res.json(row);
    });
});

// API 7: Get Likes for a Tweet
app.get('/tweets/:tweetId/likes', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const tweetId = req.params.tweetId;

    const query = `
        SELECT user.username
        FROM like
        JOIN user ON user.user_id = like.user_id
        JOIN tweet ON tweet.tweet_id = like.tweet_id
        JOIN follower ON tweet.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ? AND like.tweet_id = ?;
    `;

    db.all(query, [userId, tweetId], (err, rows) => {
        if (!rows.length) {
            return res.status(401).send('Invalid Request');
        }
        const likes = rows.map(row => row.username);
        res.json({ likes });
    });
});

// API 8: Get Replies for a Tweet
app.get('/tweets/:tweetId/replies', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const tweetId = req.params.tweetId;

    const query = `
        SELECT user.name, reply.reply
        FROM reply
        JOIN user ON user.user_id = reply.user_id
        JOIN tweet ON tweet.tweet_id = reply.tweet_id
        JOIN follower ON tweet.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ? AND reply.tweet_id = ?;
    `;

    db.all(query, [userId, tweetId], (err, rows) => {
        if (!rows.length) {
            return res.status(401).send('Invalid Request');
        }
        res.json({ replies: rows });
    });
});

// API 9: Get User Tweets
app.get('/user/tweets', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    const query = `
        SELECT tweet.tweet, tweet.date_time AS dateTime,
            (SELECT COUNT(*) FROM like WHERE tweet_id = tweet.tweet_id) AS likes,
            (SELECT COUNT(*) FROM reply WHERE tweet_id = tweet.tweet_id) AS replies
        FROM tweet
        WHERE tweet.user_id = ?;
    `;

    db.all(query, [userId], (err, rows) => {
        res.json(rows);
    });
});

// API 10: Create a Tweet
app.post('/user/tweets', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const { tweet } = req.body;

    const query = `
        INSERT INTO tweet (tweet, user_id, date_time)
        VALUES (?, ?, datetime('now'));
    `;

    db.run(query, [tweet, userId], function (err) {
        if (err) {
            return res.status(500).send('Server error');
        }
        res.send('Created a Tweet');
    });
});

// API 11: Delete a Tweet
app.delete('/tweets/:tweetId', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const tweetId = req.params.tweetId;

    const query = `DELETE FROM tweet WHERE tweet_id = ? AND user_id = ?`;

    db.run(query, [tweetId, userId], function (err) {
        if (this.changes === 0) {
            return res.status(401).send('Invalid Request');
        }
        res.send('Tweet Removed');
    });
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

module.exports = app;

