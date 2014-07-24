var root

;(function() {
  var irc = require('irc'),
    gui = require('nw.gui'),
    VERSION = '0.0.1',
    STATUS_POWER_RANKINGS = {
      '@': 0,
      '+': 1,
      '': 2
    }

  function ensureMethod(obj, attr) {
    // Returns a function that, when called, arranges for obj.attr to be 
    // called with the same args where `this` refers to obj
    return (function() { return obj[attr].apply(obj, arguments) })
  }

  function extend(m1, m2) {
    // WARNING: shallow
    var clone = {}
    for (k in m1) { clone[k] = m1[k] }
    for (k in m2) { clone[k] = m2[k] }

    return clone
  }

  function only() {
    var clone = {},
      base = arguments[0]

    for (var i=1; i<arguments.length; i++) {
      clone[arguments[i]] = base[arguments[i]]
    }

    return clone
  }

  function getChan(network, chanName) {
    return (network.channels().filter(function(e) {
      return e.name() == chanName
    })[0] || null)
  }

  function universalSend(line, cascaded) {
    // Dispatch submitted command to each level of the IRC hierarchy starting
    // with the window (which has zero or more connected networks) and 
    // executing this first command the submitted line matches (e.x. if both
    // the channel and network match `/join #foo` then the network handler will
    // be the one executed)
    if (this.parentLevel) {
      this.parentLevel.send(line, true)
    }

    var match = null

    for (var i=0; i<this.commands.length; i++) {
      var command = this.commands[i]
      match = line.match(command.pattern)
      if (match) {
        return command.exec.call(this, match, line)
      }
    }
  }

  function WindowMVM() {
    var self = this
    self.networks = ko.observableArray()
    self.input = ko.observable()
    self.lines = ko.observableArray()
    self.activeTabTitle = ko.observable('Not Connected')
    self.defaultNick = "mibiot"
    self.parentLevel = null

    self.inputHistory = JSON.parse(window.localStorage.inputHistory || "[]")
    self.inputHistoryPoint = -1

    // A "tab" can be a network, channel, or null when none of either are 
    // available.
    self.activeTab = ko.observable(self)
  }
  WindowMVM.prototype = {
    connect: function(options) {
      var network = new NetworkMVM(this, options)
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
    commands: [
      {pattern: /^\/connect (\S+) ?(\d+)?/,
       exec: function(match, line) {
         var opts = {
           host: match[1],
           port: parseInt(match[2] | '6667'),
           nick: this.defaultNick
         }

         this.connect(opts)
       }}
    ],
    send: universalSend,
    setActiveTab: function(tab) {
      console.log(this)
      root.activeTab(tab)
    },
    scrollDown: function(el, _, data) {
      var messageTable = document.getElementById('message-table'),
        messageContainer = document.getElementById('messages')

      messageContainer.scrollTop = (messageTable.offsetHeight + 100)
    },
    close: function() {
      gui.Window.get().close()
      return false
    },
    min: function() {
      gui.Window.get().minimize()
      return false
    },
    max: function() {
      gui.Window.get().maximize()
      return false
    },
    mouseMove: function(e) {
      gui.Window.get().moveBy(e.webkitMovementX, e.webkitMovementY)
    },
    startWindowDrag: function(_, e) {
      window.addEventListener('mousemove', this.mouseMove)
    },
    endWindowDrag: function(e) {
      window.removeEventListener('mousemove', this.mouseMove)
    }
  }

  function NetworkMVM(windowModel, options) {
    var self = this
    self.windowModel = windowModel
    self.channels = ko.observableArray()
    self.lines = ko.observableArray()
    self.nick = ko.observable(options.nick)
    self.parentLevel = windowModel

    var n = options.host.split('.')
    while (n.length > 2) n.shift()
    self.name = n.join('.')
    
    self.activeTabTitle = ko.observable(self.name)

    // Connect to the network, we're never going to make a network and not
    // connect to it.
    self.client = new irc.Client(options.host, options.nick, options)
    self.client.on('notice', ensureMethod(self, 'onNotice'))
    self.client.on('motd', ensureMethod(self, 'onMotd'))
    self.client.on('join', ensureMethod(self, 'onJoin'))
    self.client.on('part', ensureMethod(self, 'onPart'))
    self.client.on('names', ensureMethod(self, 'onNames'))
    self.client.on('ctcp-version', ensureMethod(self, 'onVersion'))
    self.client.on('raw', function(e) { console.log(e) })
  }
  NetworkMVM.prototype = {
    join: function(channelName) {
      var channel = new ChannelMVM(this, channelName)
      root.activeTab(channel)
      this.channels.push(channel)
    },
    send: universalSend,
    commands: [
      {pattern: /^\/join (\S+)/,
       exec: function(match, line) {
         this.join(match[1])
       }}
    ],
    onNames: function(channel, nicks) {
      var chan = getChan(this, channel),
        nickArr = []

      for (nick in nicks) {
        nickArr.push({
          name: nick,
          status: nicks[nick]
        })
      }

      chan.users(nickArr)
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
      var chan = getChan(this, channel)

      if (nick == this.nick()) {
        chan.lines.push({
          left: '*',
          right: 'You\'ve joined ' + channel,
          lineClass: 'notice join'
        })
      } else {
        chan.users.push({
          status: '',
          name: nick
        })
        chan.lines.push({
          left: '*',
          right: nick + ' has joined ' + channel,
          lineClass: 'noitce join'
        })
      }
    },
    onPart: function(channel, nick, reason, message) {
      var chan = getChan(this, channel)

      if (nick == this.nick()) {
        this.channels.remove(function(e) { return e.name == channel })
      } else {
        chan.users.remove(function(e) {
          return e.name == nick
        })

        chan.lines.push({
          left: '*',
          right: nick + ' has quit (' + reason + ')',
          lineClass: 'notice part'
        })
      }
    },
    onVersion: function(from, to, message) {
      this.windowModel.activeTab().lines.push({
        left: '*',
        right: from + ' asked for a CTCP version on you',
        lineClass: 'notice version'
      })

      this.client.ctcp(from, 'VERSION', 'AOICTDLLS (An OSX IRC Client That '
        + 'Doesn\'t Look Like Shit) ' + VERSION)
    }
  }

  function ChannelMVM(network, name) {
    var self = this
    self.lines = ko.observableArray()
    self.users = ko.observableArray()
    self.name = ko.observable(name)
    self.network = network
    self.activeTabTitle = self.name
    self.parentLevel = network

    self.sortedUsers = ko.computed(function() {
      return self.users().sort(function(a, b) {
        return STATUS_POWER_RANKINGS[a.status] - STATUS_POWER_RANKINGS[b.status]
      })
    })

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
    },
    send: universalSend,
    commands: [
      {pattern: /^\/.*/,
       exec: function(match, line) {
        this.lines.push({
          left: '*',
          right: 'Not a recognized command!',
          lineClass: 'error'
        })
       }},
      {pattern: /.+/,
       exec: function(match, line) {
         this.lines.push({
           left: this.network.nick(),
           right: line,
           lineClass: 'message self-message'
         })
         this.network.client.say(this.name(), line)
       }}
    ]
  }

  root = new WindowMVM()
  ko.applyBindings(root)
})()
