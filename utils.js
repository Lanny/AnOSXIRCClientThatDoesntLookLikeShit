var utils = {}

;(function() {
  var gui = require('nw.gui')

  utils.baseWindowVM = {
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

  utils.extend = function(m1, m2) {
    // WARNING: shallow
    var clone = {}
    for (k in m1) { clone[k] = m1[k] }
    for (k in m2) { clone[k] = m2[k] }

    return clone
  }
})()
