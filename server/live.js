var cookie = require('cookie');
var sessions = require('./sessions');
var moniker = require('moniker');
var channels = {};

function createOnCloseCallback(session, client) {
  return function () {
    var channel = channels[session.currentBin.id];

    if (!channel) {
      return;
    }

    // If admin disconnects
    if (channel.clients.admin === client) {
      delete channels[session.currentBin.id].clients.admin;
      Object.keys(channel.clients).forEach(function (name) {
        channel.clients[name].close();
      });
      delete channels[session.currentBin.id];
      console.log('Removed channel');
    } else {

      // If currently controlling user disconnects
      if (channel.controller === client) {
        channel.controller = channel.clients.admin;
        channel.clients.admin.send(JSON.stringify({
          type: 'controlDesignated'
        }));
      }

      // Remove user
      var name = Object.keys(channel.clients).filter(function (name) {
        return channel.clients[name] === client;
      })[0];
      delete channel.clients[name];
      channel.clients.admin.send(JSON.stringify({
        type: 'userLeft',
        name: name
      }));
    }
  };
}

function createOnMessageCallback(session, client) {
  return function (message) {
    var payload = JSON.parse(message);
    if (payload.type === 'join') {
      var name = moniker.choose();
      channels[session.currentBin.id].clients[name] = client;
      channels[session.currentBin.id].clients.admin.send(JSON.stringify({
        type: 'userJoined',
        name: name
      }));
      client.send(JSON.stringify({
        type: 'joined',
        name: name
      }));
    } else if (payload.type === 'snapshot') {
      channels[session.currentBin.id].clients[payload.name].send(message);
    } else if (payload.type === 'designateControl') {
      channels[session.currentBin.id].controller = channels[session.currentBin.id].clients[payload.name];
      channels[session.currentBin.id].clients[payload.name].send(JSON.stringify({
        type: 'controlDesignated'
      }));
    } else if (payload.type === 'retractControl') {
      channels[session.currentBin.id].controller.send(JSON.stringify({
        type: 'controlRetracted'
      }));
      channels[session.currentBin.id].controller = channels[session.currentBin.id].clients.admin;
      channels[session.currentBin.id].controller.send(JSON.stringify({
        type: 'controlDesignated'
      }));
    } else {
      var clients = channels[session.currentBin.id].clients;
      Object.keys(clients).forEach(function (name) {
        if (clients[name] === client) {
          return;
        }
        clients[name].send(message);
      });
    }
  }
}

module.exports = function connection(client) {

  var sessionId = cookie.parse(client.upgradeReq.headers.cookie).codebox;
  var session = sessions.get(sessionId);

  if (session.currentBin.isOwner) {
    channels[session.currentBin.id] = {
      controller: client,
      clients: {
        admin: client
      }
    }
    client.send(JSON.stringify({
      type: 'created'
    }));
    console.log('created channel')
  } else {
    client.send(JSON.stringify({
      type: 'connected',
    }));
  }

  client.on('close', createOnCloseCallback(session, client))
  client.on('message', createOnMessageCallback(session, client));

};
