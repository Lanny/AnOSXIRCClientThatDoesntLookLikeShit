;(function() {
  function wrapAutoNetwork(network) {
    network.addr = ko.observable(network.addr)
    network.startCommands = ko.observableArray(network.startCommands)
    return network
  }

  function PrefrencesVM(initValues) {
    this.prefs = {
      defaultNick: ko.observable(initValues.defaultNick),
      newTabOnPM: ko.observable(initValues.newTabOnPM),
      autoNetworks: ko.observableArray(
        initValues.autoNetworks.map(wrapAutoNetwork)),
      stylesheets: ko.observableArray(initValues.stylesheets),
      commandHistoryLength: ko.observable(initValues.commandHistoryLength)
    }
    this.notices = ko.observableArray()
  }
  PrefrencesVM.prototype = utils.extend(utils.baseWindowVM, {
    addAutoconnectNetwork: function() {
      this.prefs.autoNetworks.push({
        addr: ko.observable(),
        startCommands: ko.observableArray()
      })
    },
    domNotice: function(text, time) {
      var trueTime = time || 1000,
        PVM = this;

      var notice = {
        fading: ko.observable(false),
        'text': text
      }

      PVM.notices.push(notice)
      window.setTimeout(function() {
        notice.fading(true)

        window.setTimeout(function() {
          PVM.notices.remove(notice)
        }, 1000)
      }, trueTime)
    },
    savePrefs: function() {
      var serPrefs = {
        defaultNick: this.prefs.defaultNick(),
        newTabOnPM: this.prefs.newTabOnPM(),
        autoNetworks: this.prefs.autoNetworks().map(function(e) {
          return {
            addr: e.addr(),
            startCommands: e.startCommands()
          }
        }),
        commandHistoryLength: parseInt(this.prefs.commandHistoryLength()) || null
      }

      localStorage.settings = JSON.stringify(serPrefs)
      this.domNotice("Settings saved successfully!")
      console.log('hai?')
    },
    deleteAutoNetwork: function(autoNetwork) {
      prefRoot.prefs.autoNetworks.remove(autoNetwork)
    }
  })

  var prefRoot = new PrefrencesVM(utils.getWorkingSettings())
  ko.applyBindings(prefRoot)
})()
