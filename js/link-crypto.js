// Один файл на браузер и Node. ES-модули не годятся: через file:// браузер их не грузит.
(function (root) {
  'use strict';

  // Каждая итерация удорожает перебор паролей по шифру, который лежит на сайте у всех на виду.
  var ITERATIONS = 250000;

  function getSubtle() {
    var cryptoApi = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!cryptoApi || !cryptoApi.subtle) {
      throw new Error('Браузер не поддерживает WebCrypto: откройте сайт по https или в современном браузере');
    }
    return cryptoApi;
  }

  function toBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromBase64(text) {
    var binary = atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function deriveKey(password, salt, iterations) {
    var subtle = getSubtle().subtle;
    return subtle
      .importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (baseKey) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function encrypt(url, password) {
    var cryptoApi = getSubtle();
    var salt = cryptoApi.getRandomValues(new Uint8Array(16));
    var iv = cryptoApi.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt, ITERATIONS)
      .then(function (key) {
        return cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(url));
      })
      .then(function (cipher) {
        return {
          iterations: ITERATIONS,
          salt: toBase64(salt),
          iv: toBase64(iv),
          data: toBase64(new Uint8Array(cipher))
        };
      });
  }

  function decrypt(secret, password) {
    return deriveKey(password, fromBase64(secret.salt), secret.iterations)
      .then(function (key) {
        return getSubtle().subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(secret.iv) }, key, fromBase64(secret.data));
      })
      .then(function (plain) {
        return new TextDecoder().decode(plain);
      });
  }

  var api = { encrypt: encrypt, decrypt: decrypt };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LinkCrypto = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
