var root

;(function() {
  var irc = require('irc'),
    gui = require('nw.gui'),
    VERSION = '0.0.2',
    STATUS_POWER_RANKINGS = {
      '@': 0,
      '+': 1,
      '': 2 },
    FRIENDLY_SOCK_MSGS = {
      'ENOTFOUND': 'Remote server not found, maybe you mistyped the server ' +
        'details.'
    }

  function ensureMethod(obj, attr) {
    // Returns a function that, when called, arranges for obj.attr to be 
    // called with the same args where `this` refers to obj
    return (function() { return obj[attr].apply(obj, arguments) })
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
    var matchFound = false

    if (this.parentLevel) {
      matchFound = this.parentLevel.send(line, true)
    }

    if (!matchFound) {
      var match = null

      for (var i=0; i<this.commands.length; i++) {
        var command = this.commands[i]
        match = line.match(command.pattern)
        if (match) {
          command.exec.call(this, match, line)
          return true
        }
      }

      if (cascaded) {
        return false
      } else {
        // We've reached the end without finding a valid command, use this
        // tab's fallthrough
        this.fallthroughCommand(line)
      }
    }
  }

  function WindowMVM() {
    var self = this
    self.networks = ko.observableArray()
    self.input = ko.observable()
    self.lines = ko.observableArray()
    self.activeTabTitle = ko.observable('Not Connected')
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
    send: universalSend,
    commands: [
      {pattern: /^\/connect (?:irc:\/\/)?([a-zA-Z0-9.]+)(?::(\d+))?/,
       exec: function(match, line) {
         var opts = {
           host: match[1],
           port: parseInt(match[2] | '6667'),
           nick: utils.getWorkingSettings().defaultNick
         }

         this.connect(opts)
       }},
      {pattern: /^\/connect (\S+) ?(\d+)?/,
       exec: function(match, line) {
         var opts = {
           host: match[1],
           port: parseInt(match[2] | '6667'),
           nick: utils.getWorkingSettings().defaultNick
         }

         this.connect(opts)
       }},
      {pattern: /^\/(settings|prefrences)(.*)$/,
       exec: function(match, line) {
         if (!!match[2]) {
           root.activeTab().lines.push({
             left: 'X',
             right: '/' + match[1] + ' takes no arguments!',
             lineClass: 'error'
           })
         } else {
           gui.Window.open('prefrences.html', {width: 420, height: 500})
         }
       }}
    ],
    fallthroughCommand: function(line) {
      this.lines.push({
        left: '*',
        right: 'Not connected to any network, try `/connect server [port]`',
        lineClass: 'notice error'
      })
    },
    setActiveTab: function(tab) {
      console.log(this)
      root.activeTab(tab)
    },
    scrollDown: function(el, _, data) {
      var messageTable = document.getElementById('message-table'),
        messageContainer = document.getElementById('messages')

      messageContainer.scrollTop = (messageTable.offsetHeight + 100)
    }
  }
  // Mix in the stuff shared with other window VMs (e.x. OS buttons)
  console.log(utils)
  WindowMVM.prototype = utils.extend(utils.baseWindowVM, WindowMVM.prototype)

  function NetworkMVM(windowModel, options) {
    var self = this
    self.windowModel = windowModel
    self.channels = ko.observableArray()
    self.lines = ko.observableArray()
    self.nick = ko.observable(options.nick)
    self.parentLevel = windowModel
    self.alive = ko.observable(true)

    var n = options.host.split('.')
    while (n.length > 2) n.shift()
    self.name = n.join('.')
    
    self.activeTabTitle = ko.observable(self.name)

    // Connect to the network, we're never going to make a network and not
    // connect to it.
    var workingOptions = utils.extend(options, {
      autoConnect: false, showErrors: true })
    
    self.client = new irc.Client(options.host, options.nick, workingOptions)
    self.client.connect()
    self.client.conn.on('error', function(err) {
      self.alive(false)

      var msg = FRIENDLY_SOCK_MSGS[err.code] || 'Socket error: ' + err.code
      self.lines.push({
        left: '*',
        right: msg,
        lineClass: 'error system-error network-error'
      })
    })

    self.client.on('notice', ensureMethod(self, 'onNotice'))
    self.client.on('motd', ensureMethod(self, 'onMotd'))
    self.client.on('join', ensureMethod(self, 'onJoin'))
    self.client.on('part', ensureMethod(self, 'onPart'))
    self.client.on('names', ensureMethod(self, 'onNames'))
    self.client.on('pm', ensureMethod(self, 'onPM'))
    self.client.on('ctcp-version', ensureMethod(self, 'onVersion'))
    self.client.on('raw', function(e) { 
      try {
        console.log(e)
      } catch (e) {
        alert("wtf mate?" + console)
      } 
    })
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
       }},
      {pattern: /^\/msg.*/,
       exec: function(match, line) {
         var match = line.match(/^\/msg (\S+) (.+)$/),
           target = match[1],
           msg = match[2]

         if (!(target && msg)) {
            root.activeTab().lines.push({
             left: '*',
             right: 'Invalid syntax, usage: `/msg user message`',
             lineClass: 'notice error'
           })
         } else {
           this.client.say(target, msg)
           root.activeTab().lines.push({
             left: target + '<-',
             right: msg,
             lineClass: 'message user-msg sent'
           })
         }
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
    onPM: function(nick, text, message) {
      var tab = getChan(this, nick)
      if (tab === null) {
        if (utils.getWorkingSettings().newTabOnPM) {
          tab = new UserVM(this, nick)
          this.channels.push(tab)
          tab.onPrivMessage(nick, text, message)
        } else {
          var activeTab = this.windowModel.activeTab()
          activeTab.lines.push({
            left: nick + '->',
            right: text,
            lineClass: 'message user-msg recv'
          })
        }
      } else {
        tab.onPrivMessage(nick, text, message)
      }
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

  function UserVM(network, name) {
    var self = this
    self.lines = ko.observableArray()
    self.name = ko.observable(name)
    self.network = network
    self.activeTabTitle = self.name
    self.parentLevel = network

  }
  UserVM.prototype = utils.extend(ChannelMVM.prototype, {
    onPrivMessage: function(nick, text, message) {
      this.lines.push({
        left: nick,
        right: text,
        lineClass: 'message user-message'
      })
    }
  })

  root = new WindowMVM()
  ko.applyBindings(root)
})()
