var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
app.io = io;
server.listen(process.env.PORT || '3000');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var bodyParser = require('body-parser');
require('dotenv').config({path: 'config/local.env'});

// Mongo
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

require('./models/Player');
require('./models/Team');
require('./models/Challenge');
require('./models/TeamChallenge');
require('./models/Alert');

var db_uri = process.env.MONGODB_URI;
if (!db_uri) {
	console.log('Defaulting to local mongo db instance.');
	db_uri = 'mongodb://127.0.0.1/sparcPongDb';
}
mongoose.connect(db_uri);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(morgan(process.env.MORGAN_FORMAT || 'tiny'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Include scripts
app.use('/bower', express.static(path.join(__dirname, 'bower_components')));

app.use('/',								require('./routes/basic'));
app.use('/api/player',						require('./routes/player'));
app.use('/api/team',						require('./routes/team'));
app.use('/api/challenge/player',			require('./routes/challenges/playerChallenge'));
app.use('/api/challenge/team',				require('./routes/challenges/teamChallenge'));
app.use('/api/playerAlerts',				require('./routes/alert'));
app.use('/api/envBridge',					require('./routes/envBridge'));


// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handler
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: err
	});
});


// Active Sockets
var activeSockets = {};
var USER_KEY = 'userId';

// Helper functions
function activeClients() {
    var size = 0, key;
    for (key in activeSockets) {
        if (activeSockets.hasOwnProperty(key)) size++;
    }
    return size;
}
function onlineUsers() {
	var ids = [], key;
    for (key in activeSockets) {
        if (activeSockets.hasOwnProperty(key) && activeSockets[key][USER_KEY] != null) {
			ids.push(activeSockets[key][USER_KEY]);
		}
    }
    var uniqueIds = [];
    for ( i = 0; i < ids.length; i++ ) {
        var current = ids[i];
        if (uniqueIds.indexOf(current) < 0) uniqueIds.push(current);
    }
    return uniqueIds;
}

// Socket Events
io.on('connection', function(socket) {
	console.log('New client socket connection...');
	activeSockets[socket.id] = {};
	activeSockets[socket.id]['socket'] = socket;
	activeSockets[socket.id][USER_KEY] = null;
	
	// Notify all clients of presence
	io.sockets.emit('client:enter', activeClients());
	
	// Give initial list of online users
	socket.emit('client:online', onlineUsers());
	
	socket.on('disconnect', function() {
		console.log('Disconnected socket connection...');
		var userId = activeSockets[socket.id][USER_KEY];
		delete activeSockets[socket.id];
		if (userId) {
			io.sockets.emit('client:online', onlineUsers());
		}
		io.sockets.emit('client:leave', activeClients());
	});
	
	socket.on('login', function(userId) {
		console.log('Login from userId: '+ userId);
		activeSockets[socket.id][USER_KEY] = userId;
		io.sockets.emit('client:online', onlineUsers());
	});
	
	socket.on('logout', function(userId) {
		console.log('Logout from userId: '+ userId);
		activeSockets[socket.id][USER_KEY] = null;
		io.sockets.emit('client:online', onlineUsers());
	});
});

module.exports = app;
