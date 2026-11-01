/* HUX web app (the iPhone version): start-up helpers that must not wait for the app script.
 * A separate file (not inline) so the Content-Security-Policy can forbid inline scripts. BASE is filled in by
 * scripts/build-web.mjs.
 */
(function () {
  var BASE = '/hux-app';

  // Clickjacking: HUX never runs inside someone else's page (GitHub Pages cannot send a frame-ancestors header)
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try {
      window.top.location.replace(window.self.location.href);
    } catch (e) {
      /* the other page blocks it: HUX simply stays hidden there */
    }
    return;
  }

  // The service worker: fast start, the offline page and notifications
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }).catch(function () {});
    });
  }

  // iPhone: when the keyboard opens, Safari keeps the page at full height and slides it up. Size the app to the part
  // that is still visible, so the chat box and the buttons stay above the keyboard. (Not while zoomed in.)
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && window.visualViewport) {
    var fit = function () {
      var vv = window.visualViewport;
      if (Math.abs(vv.scale - 1) > 0.01) return;
      document.documentElement.style.setProperty('--app-height', Math.round(vv.height) + 'px');
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.visualViewport.addEventListener('resize', fit);
    fit();
  }
})();
