;(function() {
  function PrefrencesVM() {
    this.prefs = {
      stylesheets: ko.observableArray(),
      commandHistoryLength: ko.observable()
    }
  }
  PrefrencesVM.prototype = utils.extend(utils.baseWindowVM, {})

  prefRoot = new PrefrencesVM()
  ko.applyBindings(prefRoot)
})()
