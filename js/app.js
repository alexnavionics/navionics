(function () {
  'use strict';

  var GATE_STORAGE_KEY = 'site-gate-open';

  // Сам код нигде не хранится: верный код просто расшифровывает метку из js/site.js.
  function initGate() {
    var gate = window.SITE_GATE;
    var body = document.body;
    if (!gate) {
      body.classList.remove('locked');
      return;
    }
    try {
      if (sessionStorage.getItem(GATE_STORAGE_KEY) === '1') {
        body.classList.remove('locked');
        return;
      }
    } catch (e) {} // в приватном режиме sessionStorage бывает недоступен, тогда спросим код ещё раз

    var form = document.getElementById('gate-form');
    var input = document.getElementById('gate-code');
    var error = document.getElementById('gate-error');
    var button = form.querySelector('button');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      button.disabled = true;
      error.textContent = '';
      window.LinkCrypto.decrypt(gate, input.value)
        .then(function (marker) {
          if (marker !== 'ok') throw new Error('Неверный код');
          try { sessionStorage.setItem(GATE_STORAGE_KEY, '1'); } catch (e) {}
          body.classList.remove('locked');
          // ленты скриншотов мерили ширину, пока страница была скрыта
          window.dispatchEvent(new Event('resize'));
        })
        .catch(function () {
          error.textContent = 'Неверный код. Проверьте и попробуйте снова.';
          input.select();
        })
        .then(function () {
          button.disabled = false;
        });
    });
  }

  // Ссылки, у которых нет своей кнопки в тексте, уходят в «Дополнительные материалы».
  function initLinks() {
    var links = window.PROTECTED_LINKS || [];
    var linksById = {};
    var placedIds = {};
    var unlockedUrls = {};

    links.forEach(function (link) {
      if (link.id) linksById[link.id] = link;
    });

    document.querySelectorAll('[data-link]').forEach(function (button) {
      var id = button.getAttribute('data-link');
      var link = linksById[id];
      if (!link) {
        button.disabled = true;
        button.title = 'Ссылка «' + id + '» не найдена в js/links.js';
        return;
      }
      placedIds[id] = true;
      bindLockedButton(button, link, id);
    });

    var extraList = document.getElementById('extra-links-list');
    links.forEach(function (link, index) {
      if (link.id && placedIds[link.id]) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--locked';
      button.textContent = link.title;
      extraList.appendChild(button);
      bindLockedButton(button, link, link.id || 'extra-' + index);
      document.getElementById('extra-links').hidden = false;
    });

    function bindLockedButton(button, link, unlockKey) {
      var panel = null;
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', function () {
        if (!panel) {
          panel = createUnlockPanel(link, unlockKey);
          button.insertAdjacentElement('afterend', panel);
        } else {
          panel.hidden = !panel.hidden;
        }
        button.setAttribute('aria-expanded', String(!panel.hidden));
        if (unlockedUrls[unlockKey]) showOpenButton(panel, unlockedUrls[unlockKey]);
        var input = panel.querySelector('input');
        if (!panel.hidden && input) input.focus();
      });
    }

    function createUnlockPanel(link, unlockKey) {
      var panel = document.createElement('div');
      panel.className = 'unlock';
      var form = document.createElement('form');
      form.className = 'unlock__form';
      form.autocomplete = 'off';
      var input = document.createElement('input');
      input.type = 'password';
      input.required = true;
      input.placeholder = 'Пароль';
      input.setAttribute('aria-label', 'Пароль: ' + link.title);
      var submit = document.createElement('button');
      submit.className = 'btn';
      submit.type = 'submit';
      submit.textContent = 'Открыть';
      var status = document.createElement('div');
      status.className = 'unlock__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.appendChild(input);
      form.appendChild(submit);
      panel.appendChild(form);
      panel.appendChild(status);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submit.disabled = true;
        showStatus(status, 'Проверяем пароль…', '');
        window.LinkCrypto.decrypt(link.secret, input.value)
          .then(function (url) {
            if (!/^https?:\/\//i.test(url)) throw new Error('Некорректная ссылка');
            unlockedUrls[unlockKey] = url;
            showOpenButton(panel, url);
          })
          .catch(function (error) {
            // так AES-GCM сообщает о неверном пароле, остальные ошибки показываем как есть
            var message = error && error.name === 'OperationError' ? 'Неверный пароль' : (error.message || String(error));
            showStatus(status, message, 'error');
            input.select();
          })
          .then(function () {
            submit.disabled = false;
          });
      });
      return panel;
    }

    function showOpenButton(panel, url) {
      if (panel.querySelector('.unlock__open')) return;
      panel.textContent = '';
      var open = document.createElement('a');
      open.className = 'btn unlock__open';
      open.setAttribute('role', 'button');
      open.tabIndex = 0;
      open.setAttribute('data-href', url);
      open.textContent = 'Открыть в облаке';
      bindDataHref(open);
      panel.appendChild(open);
    }
  }

  function showStatus(element, text, kind) {
    element.textContent = text;
    element.className = 'unlock__status' + (kind ? ' unlock__status--' + kind : '');
  }

  // Ссылка открывается скриптом, а не через href, чтобы адрес не светился в строке состояния.
  function bindDataHref(el) {
    function go() {
      var url = el.getAttribute('data-href');
      if (!url) return;
      if (url.indexOf('mailto:') === 0) window.location.href = url;
      else window.open(url, '_blank', 'noopener');
    }
    el.addEventListener('click', go);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  }

  function initCarousels() {
    document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
      var track = carousel.querySelector('.carousel-track');
      var items = Array.prototype.slice.call(carousel.querySelectorAll('.carousel-item'));
      var dotsBox = carousel.querySelector('.car-dots');

      function offsetOf(item) {
        return item.offsetLeft - items[0].offsetLeft;
      }
      function scrollToItem(i) {
        var target = items[Math.max(0, Math.min(items.length - 1, i))];
        track.scrollTo({ left: offsetOf(target), behavior: 'smooth' });
      }
      function currentIndex() {
        var best = 0;
        items.forEach(function (item, i) {
          if (Math.abs(offsetOf(item) - track.scrollLeft) < Math.abs(offsetOf(items[best]) - track.scrollLeft)) best = i;
        });
        return best;
      }

      items.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'car-dot';
        dot.setAttribute('aria-label', 'Снимок ' + (i + 1));
        dot.addEventListener('click', function () { scrollToItem(i); });
        dotsBox.appendChild(dot);
      });

      function update() {
        var current = currentIndex();
        dotsBox.querySelectorAll('.car-dot').forEach(function (dot, i) { dot.classList.toggle('active', i === current); });
        carousel.classList.toggle('carousel--static', track.scrollWidth <= track.clientWidth + 1);
      }
      track.addEventListener('scroll', update);
      window.addEventListener('resize', update);
      items.forEach(function (item) { item.querySelector('img').addEventListener('load', update); });
      update();
      carousel.querySelector('.car-prev').addEventListener('click', function () { scrollToItem(currentIndex() - 1); });
      carousel.querySelector('.car-next').addEventListener('click', function () { scrollToItem(currentIndex() + 1); });
    });
  }

  function initSteps() {
    document.querySelectorAll('.step > strong:first-child').forEach(function (num) {
      var step = parseInt(num.textContent, 10);
      if (!step) return;
      var level = Math.min(step, 7);
      num.parentNode.style.setProperty('--depth', 'var(--depth-' + level + ')');
      if (level <= 2) num.parentNode.classList.add('step--shallow');
    });
  }

  // Остановит обычного пользователя, но не того, кто знает про просмотр кода страницы.
  function initCopyProtection() {
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('dragstart', function (e) { e.preventDefault(); });
    document.addEventListener('copy', function (e) {
      if (!(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
    });
    document.addEventListener('keydown', function (e) {
      var key = (e.key || '').toLowerCase();
      if (e.key === 'F12') { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'u' || key === 'p')) { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) e.preventDefault();
    });
  }

  document.getElementById('year').textContent = new Date().getFullYear();
  document.querySelectorAll('.btn[data-href]').forEach(bindDataHref);
  initGate();
  initLinks();
  initCarousels();
  initSteps();
  initCopyProtection();
})();
