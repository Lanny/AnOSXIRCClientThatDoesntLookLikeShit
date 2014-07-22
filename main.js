var root

;(function() {
  var irc = require('irc')

  function ensureMethod(obj, attr) {
    // Returns a function that, when called, arrangeds for obj.attr to be 
    // called with the same args where `this` refers to obj
    return (function() { return obj[attr].apply(obj, arguments) })
  }

  function WindowMVM() {
    var self = this
    self.networks = ko.observableArray()
    self.input = ko.observable()
    self.defaultNick = "mibiot"

    self.inputHistory = JSON.parse(window.localStorage.inputHistory || "[]")
    self.inputHistoryPoint = -1

    // A "tab" can be a network, channel, or null when none of either are 
    // available.
    self.activeTab = ko.observable(self)
  }
  WindowMVM.prototype = {
    connect: function(options) {
      var network = new NetworkMVM(options)
      this.networks.push(network)
      this.activeTab(network)
    },
    lineSubmit: function(_, e) {
      if (e.keyCode == 13) {
        var line = this.input()
        this.activeTab().send(line)

        this.inputHistory.unshift(line)
        this.inputHistory.splice(50) // Keep 50 lines
        this.inputHistoryPoint = -1
        window.localStorage.inputHistory = JSON.stringify(this.inputHistory)

        this.input('')
      } else if (e.keyCode == 38) {
        // Up arrow
        this.inputHistoryPoint++
        if (this.inputHistoryPoint >= this.inputHistory.length) {
          this.inputHistoryPoint--
        }
        this.input(this.inputHistory[this.inputHistoryPoint])
      } else if (e.keyCode == 40) {
        // Down arrow
        this.inputHistoryPoint--
        if (this.inputHistoryPoint < 0) {
          this.inputHistoryPoint = -1
        } else {
          this.input(this.inputHistory[this.inputHistoryPoint])
        }
      } else {
        return true
      }
    },
    send: function(line) {
      var match = null

      if (match = line.match(/^\/connect (\S+) ?(\d+)?/)) {
        var opts = {
          host: match[1],
          port: parseInt(match[2] | '6667'),
          nick: this.defaultNick
        }

        this.connect(opts)
      } else if (match = line.match(/^\/nick (\S+)$/)) {
        this.defaultNick = match[1]
      }
    },
    setActiveTab: function(tab) {
      console.log(this)
      root.activeTab(tab)
    }
  }

  function NetworkMVM(options) {
    var self = this
    self.channels = ko.observableArray()
    self.lines = ko.observableArray()

    var n = options.host.split('.')
    while (n.length > 2) n.shift()
    self.name = n.join('.')

    // Connect to the network, we're never going to make a network and not
    // connect to it.
    self.client = new irc.Client(options.host, options.nick, options)
    self.client.on('notice', ensureMethod(self, 'onNotice'))
    self.client.on('motd', ensureMethod(self, 'onMotd'))
    self.client.on('join', ensureMethod(self, 'onJoin'))
    self.client.on('raw', function(e) { console.log(e) })
  }
  NetworkMVM.prototype = {
    join: function(channelName) {
      var channel = new ChannelMVM(this, channelName)
      this.channels.push(channel)
    },
    send: function(line) {
      var match = null

      if (match = line.match(/^\/join (\S+)/)) {
        this.join(match[1])
      }
    },
    onNotice: function(nick, to, text, e) {
      this.lines.push({
        left: nick || '*',
        right: text,
        lineClass: 'notice'
      })
    },
    onMotd: function(motd) {
      this.lines.push({
        left: '*',
        right: motd,
        lineClass: 'notice'
      })
    },
    onJoin: function(channel, nick, message) {
      console.log(channel, nick, message)
    }
  }

  function ChannelMVM(network, name) {
    var self = this
    self.lines = ko.observableArray()
    self.users = ko.observableArray()
    self.name = ko.observable(name)
    self.network = network

    network.client.join(name)

    network.client.on('message' + name, ensureMethod(self, 'onChanMessage'))
  }
  ChannelMVM.prototype = {
    onChanMessage: function(nick, text, message) {
      this.lines.push({
        left: nick,
        right: text,
        lineClass: 'message'
      })
    }
  }

  root = new WindowMVM()
  ko.applyBindings(root)
})()
