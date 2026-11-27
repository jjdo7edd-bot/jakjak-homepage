/* 작작스튜디오 갤러리: 작품 목록(works.json) 표시, 팝업, 관리자 모드(?admin) */
(function () {
  'use strict';
  var REPO = 'jjdo7edd-bot/jakjak-homepage';
  var BRANCH = 'main';
  var PER = 8;
  var JSON_PATH = 'assets/works.json';

  var grid = document.querySelector('.gallery-grid');
  var pager = document.querySelector('nav[aria-label="갤러리 페이지"]');
  if (!grid) return;

  var params = new URLSearchParams(location.search);
  var wantAdmin = params.has('admin');
  var isAdmin = false;
  var page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  var works = [];
  var jsonSha = null;
  var placeholderHTML = grid.innerHTML;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var memToken = '';
  function token() { if (memToken) return memToken; try { return sessionStorage.getItem('jj_t') || ''; } catch (e) { return ''; } }
  function setToken(t) { memToken = t; try { if (t) sessionStorage.setItem('jj_t', t); else sessionStorage.removeItem('jj_t'); } catch (e) {} }
  function b64encUtf8(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }
  function imgSrc(path) {
    if (!path) return '';
    if (/^https?:/.test(path)) return path;
    return isAdmin ? 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + path : path;
  }
  function api(method, path, body) {
    if (method === 'GET') path += (path.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    return fetch('https://api.github.com/repos/' + REPO + '/' + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function pageUrl(n) {
    var q = [];
    if (n > 1) q.push('page=' + n);
    if (isAdmin) q.push('admin');
    return 'gallery.html' + (q.length ? '?' + q.join('&') : '');
  }

  /* ---------- data ---------- */
  function fetchRemote() {
    return api('GET', 'contents/' + JSON_PATH + '?ref=' + BRANCH).then(function (r) {
      if (r.status === 404) return { works: [], sha: null };
      if (!r.ok) throw new Error('목록을 불러오지 못했어요 (' + r.status + '). 다시 로그인해 주세요.');
      return r.json().then(function (j) {
        return { works: (JSON.parse(b64decUtf8(j.content)).works) || [], sha: j.sha };
      });
    });
  }
  function load() {
    if (isAdmin && token()) {
      return fetchRemote().then(function (d) { works = d.works; jsonSha = d.sha; });
    }
    return fetch(JSON_PATH + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : { works: [] };
    }).then(function (j) { works = j.works || []; }).catch(function () { works = []; });
  }
  /* mutate(list): 목록을 바꾸는 함수. 저장이 충돌하면 최신 목록을 다시 받아 한 번 더 적용해요. */
  function saveJson(message, mutate) {
    function put(list, sha) {
      var body = { message: message, branch: BRANCH, content: b64encUtf8(JSON.stringify({ works: list }, null, 2) + '\n') };
      if (sha) body.sha = sha;
      return api('PUT', 'contents/' + JSON_PATH, body);
    }
    var next = works.slice(); mutate(next);
    return put(next, jsonSha).then(function (r) {
      if (r.ok) return r.json().then(function (j) { works = next; jsonSha = j.content.sha; });
      if (r.status !== 409 && r.status !== 422) return r.json().then(function (e) { throw new Error('저장 실패: ' + (e.message || r.status)); });
      return fetchRemote().then(function (d) {
        var fresh = d.works.slice(); mutate(fresh);
        return put(fresh, d.sha).then(function (r2) {
          if (!r2.ok) return r2.json().then(function (e) { throw new Error('저장 실패: ' + (e.message || r2.status) + ' · 새로고침 후 다시 시도해 주세요.'); });
          return r2.json().then(function (j) { works = fresh; jsonSha = j.content.sha; });
        });
      });
    });
  }

  var lastImageSize = null;
  /* 여러 단계로 나눠 줄여서 글자·선이 뭉개지지 않게 */
  function scaleToJpeg(img, max, quality) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var k = Math.min(1, max / Math.max(w, h));
    var tw = Math.round(w * k), th = Math.round(h * k);
    var src = img, sw = w, sh = h;
    while (sw / 2 > tw && sh / 2 > th) {
      var step = document.createElement('canvas');
      step.width = Math.round(sw / 2); step.height = Math.round(sh / 2);
      var sc = step.getContext('2d');
      sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = 'high';
      sc.drawImage(src, 0, 0, step.width, step.height);
      src = step; sw = step.width; sh = step.height;
    }
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(src, 0, 0, tw, th);
    return c.toDataURL('image/jpeg', quality).split(',')[1];
  }
  function loadImage(url, cors) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('이미지를 읽지 못했어요.')); };
      img.src = url;
    });
  }
  /* 원본(최대 2400px)과 목록용 작은 사진(최대 960px)을 함께 만들어요 */
  function makeJpegs(file) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      lastImageSize = [img.naturalWidth, img.naturalHeight];
      var out = { full: scaleToJpeg(img, 2400, 0.92), thumb: scaleToJpeg(img, THUMB_MAX, 0.85) };
      URL.revokeObjectURL(url);
      return out;
    }, function (err) { URL.revokeObjectURL(url); throw err; });
  }
  var THUMB_MAX = 960;

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했어요.')); };
      fr.readAsDataURL(file);
    });
  }
  function isSvg(file) { return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name); }
  function isGif(file) { return file.type === 'image/gif' || /\.gif$/i.test(file.name); }
  var GIF_MAX_MB = 20;
  function putFile(path, b64, message) {
    return api('PUT', 'contents/' + path, { message: message, branch: BRANCH, content: b64 }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error('이미지 업로드 실패: ' + (e.message || r.status)); });
      return path;
    });
  }
  /* 결과: { path: 원본 경로, thumbB64: 목록용 작은 사진 데이터(SVG는 없음) } */
  function uploadImage(file) {
    var svg = isSvg(file), gif = isGif(file);
    var base = 'assets/works/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    /* SVG는 벡터 그대로, GIF는 움직임이 살아 있도록 원본 그대로 저장해요. 나머지는 고화질 JPG로 저장해요. */
    if (svg || gif) {
      lastImageSize = null;
      return readAsBase64(file).then(function (b64) { return putFile(base + (svg ? '.svg' : '.gif'), b64, 'Add work image'); })
        .then(function (path) { return { path: path, thumbB64: null }; });
    }
    return makeJpegs(file).then(function (j) {
      return putFile(base + '.jpg', j.full, 'Add work image').then(function (path) { return { path: path, thumbB64: j.thumb }; });
    });
  }
  /* 이미 올라가 있는 대표 사진으로 목록용 사진을 만들어요 (예전에 올린 작품용). 실패해도 저장은 계속돼요. */
  function thumbFromExisting(path) {
    if (!path || /\.(svg|gif)$/i.test(path) || /^https?:/.test(path)) return Promise.resolve(null);
    var url = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + path + '?t=' + Date.now();
    return loadImage(url, true).then(function (img) {
      return putFile(path.replace(/\.jpe?g$/i, '') + '-t.jpg', scaleToJpeg(img, THUMB_MAX, 0.85), 'Add work thumbnail');
    }).catch(function () { return null; });
  }

  function deleteImage(path) {
    if (!path || /^https?:/.test(path)) return Promise.resolve();
    return api('GET', 'contents/' + path + '?ref=' + BRANCH).then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (j) {
        return api('DELETE', 'contents/' + path, { message: 'Remove work image', branch: BRANCH, sha: j.sha });
      });
    });
  }

  /* 작품 사진 목록 (예전 데이터는 image 하나만 있어요) */
  var MAX_IMAGES = 4;
  function imagesOf(w) {
    if (Array.isArray(w.images) && w.images.length) return w.images.filter(Boolean).slice(0, MAX_IMAGES);
    return w.image ? [w.image] : [];
  }

  /* ---------- render ---------- */
  function tileHTML(w, idx) {
    var whole = w.fit === 'contain';
    var img = w.image
      ? '<img src="' + esc(imgSrc(w.thumb || w.image)) + '" alt="' + esc(w.title) + '" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:' + (whole ? 'contain' : 'cover') + ';display:block">'
      : '<span style="display:flex;flex-direction:column;align-items:center;gap:8px">' + "<svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#C8C8C8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' role='img' aria-label='작업 이미지 자리'><rect x='3' y='4' width='18' height='16' rx='2'></rect><circle cx='9' cy='10' r='1.8'></circle><path d='M21 16.5 15.5 11 6 20'></path></svg>" + '<span style="font-size:10px;letter-spacing:0.04em;color:#BDBDBD">2400 × 3000px</span></span>';
    var admin = isAdmin
      ? '<div class="work-admin"><button type="button" data-act="left" data-i="' + idx + '" aria-label="앞으로">&larr;</button>' +
        '<button type="button" data-act="right" data-i="' + idx + '" aria-label="뒤로">&rarr;</button>' +
        '<button type="button" data-act="edit" data-i="' + idx + '">수정</button>' +
        '<button type="button" data-act="del" data-i="' + idx + '">삭제</button></div>'
      : '';
    return '<div class="work-cell"><a href="#" class="work" data-i="' + idx + '" style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="position:relative;aspect-ratio:4 / 5">' +
      '<div class="work-img" style="position:absolute;inset:0;background:' + (whole && w.image ? '#FFFFFF' : 'rgba(237, 230, 218, 0.5)') + ';display:flex;align-items:center;justify-content:center;overflow:hidden;transition:filter 0.25s">' + img + '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><span style="font-weight:700">' + esc(w.title) + '</span><span style="color:#8A8A8A;font-size:11px">' + esc(w.year) + '</span></div>' +
      '</a>' + admin + '</div>';
  }

  function renderPager(total) {
    if (!pager) return;
    var pages = Math.max(1, Math.ceil(total / PER));
    var prev = page > 1
      ? '<a href="' + pageUrl(page - 1) + '" aria-label="이전 작업" style="padding:8px 10px;color:#555555">&lt;</a>'
      : '<span aria-hidden="true" style="padding:8px 10px;color:#CCCCCC">&lt;</span>';
    var next = page < pages
      ? '<a href="' + pageUrl(page + 1) + '" aria-label="다음 작업" style="padding:8px 10px;color:#555555">&gt;</a>'
      : '<span aria-hidden="true" style="padding:8px 10px;color:#CCCCCC">&gt;</span>';
    pager.innerHTML = prev + next;
  }

  function render() {
    if (!works.length && !isAdmin) {
      grid.innerHTML = placeholderHTML;
      renderPager(PER);
      return;
    }
    var pages = Math.max(1, Math.ceil(works.length / PER));
    if (page > pages) page = pages;
    var start = (page - 1) * PER;
    var html = '';
    if (isAdmin) html += '<button type="button" class="work-add" data-act="add">+ 작품 추가</button>';
    works.slice(start, start + PER).forEach(function (w, k) { html += tileHTML(w, start + k); });
    grid.innerHTML = html;
    renderPager(works.length);
  }

  /* ---------- popup ---------- */
  var modal = document.createElement('div');
  modal.className = 'jj-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="jj-modal-box" role="dialog" aria-modal="true" aria-labelledby="jj-modal-title">' +
    '<button type="button" class="jj-modal-close" aria-label="닫기">&times;</button>' +
    '<div class="jj-modal-img"></div>' +
    '<div class="jj-modal-text"><h2 id="jj-modal-title"></h2><p class="jj-modal-year"></p><div class="jj-modal-body"></div></div>' +
    '</div>';
  document.body.appendChild(modal);
  var lastFocus = null;

  var PLACEHOLDER = '<div class="jj-modal-img-inner">' + "<svg width='36' height='36' viewBox='0 0 24 24' fill='none' stroke='#C8C8C8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' role='img' aria-label='작업 이미지 자리'><rect x='3' y='4' width='18' height='16' rx='2'></rect><circle cx='9' cy='10' r='1.8'></circle><path d='M21 16.5 15.5 11 6 20'></path></svg>" + '</div>';
  var ARROW = function (dir) {
    var d = dir === 'prev' ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7';
    return '<button type="button" class="jj-modal-nav jj-modal-' + dir + '" aria-label="' + (dir === 'prev' ? '이전 사진' : '다음 사진') + '">' +
      '<svg width="14" height="22" viewBox="4 3 16 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg></button>';
  };
  var cur = { imgs: [], i: 0, title: '' };
  function showSlide(i) {
    var box = modal.querySelector('.jj-modal-img');
    if (!cur.imgs.length) { box.innerHTML = PLACEHOLDER; return; }
    cur.i = Math.max(0, Math.min(cur.imgs.length - 1, i));
    var n = cur.imgs.length;
    box.innerHTML =
      '<div class="jj-modal-img-inner' + (cur.whole ? ' is-whole' : '') + '"><img src="' + esc(imgSrc(cur.imgs[cur.i])) + '" alt="' + esc(cur.title) + (n > 1 ? ' (' + (cur.i + 1) + '/' + n + ')' : '') + '"></div>' +
      (n > 1 && cur.i > 0 ? ARROW('prev') : '') +
      (n > 1 && cur.i < n - 1 ? ARROW('next') : '');
    /* 다음 사진 미리 불러오기 */
    if (cur.i + 1 < n) { var pre = new Image(); pre.src = imgSrc(cur.imgs[cur.i + 1]); }
  }
  function openWork(w) {
    lastFocus = document.activeElement;
    cur = { imgs: imagesOf(w), i: 0, title: w.title || '', whole: w.fit === 'contain' };
    showSlide(0);
    modal.querySelector('h2').textContent = w.title || '';
    modal.querySelector('.jj-modal-year').textContent = w.year || '';
    modal.querySelector('.jj-modal-body').textContent = w.description || '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.jj-modal-close').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  /* 팝업 이미지 호버 확대 (2배, 마우스 위치 기준) */
  var zoomBox = modal.querySelector('.jj-modal-img');
  /* 터치 화면(모바일)에서는 확대하지 않아요 */
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  zoomBox.addEventListener('mousemove', function (e) {
    if (!canHover) return;
    var inner = e.target.closest('.jj-modal-img-inner');
    var img = inner && inner.querySelector('img');
    if (!img) return;
    var r = inner.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * 100;
    var y = ((e.clientY - r.top) / r.height) * 100;
    img.style.transformOrigin = x + '% ' + y + '%';
    img.style.transform = 'scale(2)';
  });
  zoomBox.addEventListener('mouseleave', function () {
    var img = zoomBox.querySelector('img');
    if (img) img.style.transform = '';
  });
  zoomBox.addEventListener('mouseout', function (e) {
    var inner = zoomBox.querySelector('.jj-modal-img-inner');
    if (inner && !inner.contains(e.relatedTarget)) {
      var img = inner.querySelector('img');
      if (img) img.style.transform = '';
    }
  });

  modal.addEventListener('click', function (e) {
    var nav = e.target.closest('.jj-modal-nav');
    if (nav) {
      var dir = nav.classList.contains('jj-modal-prev') ? -1 : 1;
      showSlide(cur.i + dir);
      var again = modal.querySelector(dir < 0 ? '.jj-modal-prev' : '.jj-modal-next') || modal.querySelector('.jj-modal-nav');
      if (again) again.focus();
      return;
    }
    if (e.target === modal || e.target.closest('.jj-modal-close')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowRight' && cur.i < cur.imgs.length - 1) showSlide(cur.i + 1);
    else if (e.key === 'ArrowLeft' && cur.i > 0) showSlide(cur.i - 1);
  });

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (btn) { e.preventDefault(); adminAction(btn.getAttribute('data-act'), parseInt(btn.getAttribute('data-i'), 10)); return; }
    var a = e.target.closest('a.work');
    if (!a) return;
    e.preventDefault();
    var i = a.getAttribute('data-i');
    if (i == null) {
      openWork({ title: a.querySelector('span') ? a.querySelector('span').textContent : '', year: '', description: '' });
      return;
    }
    openWork(works[parseInt(i, 10)]);
  });

  /* ---------- admin ---------- */
  var statusEl = null;
  function status(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isErr ? '#C0392B' : '#555555';
  }

  function buildAdminBar() {
    var bar = document.createElement('div');
    bar.className = 'jj-admin-bar';
    bar.innerHTML =
      '<strong>관리자 모드</strong>' +
      '<button type="button" class="jj-pw-change">비밀번호 변경</button>' +
      '<button type="button" class="jj-logout">나가기</button>' +
      '<span class="jj-status" role="status"></span>';
    var section = grid.closest('section');
    section.insertBefore(bar, section.firstChild);
    statusEl = bar.querySelector('.jj-status');
    bar.querySelector('.jj-logout').addEventListener('click', function () {
      setToken('');
      location.href = 'gallery.html';
    });
    bar.querySelector('.jj-pw-change').addEventListener('click', function () { openLogin('change'); });
  }

  /* ---------- password <-> token (AES-GCM, PBKDF2) ---------- */
  var ADMIN_PATH = 'assets/admin.json';
  function u8(b64) { return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }
  function b64(buf) { var s = ''; new Uint8Array(buf).forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }
  function deriveKey(pw, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptToken(tok, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var iter = 250000;
    return deriveKey(pw, salt, iter).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(tok));
    }).then(function (ct) { return { v: 1, iter: iter, salt: b64(salt), iv: b64(iv), data: b64(ct) }; });
  }
  function decryptToken(blob, pw) {
    return deriveKey(pw, u8(blob.salt), blob.iter).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(blob.iv) }, key, u8(blob.data));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }
  function fetchAdminBlob() {
    return fetch(ADMIN_PATH + '?v=' + Date.now()).then(function (r) {
      if (r.ok) return r.json();
      return fetch('https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + ADMIN_PATH + '?v=' + Date.now())
        .then(function (r2) { return r2.ok ? r2.json() : null; });
    }).catch(function () { return null; });
  }
  function saveAdminBlob(tok, pw) {
    var prev = memToken; memToken = tok;
    return api('GET', 'contents/' + ADMIN_PATH + '?ref=' + BRANCH).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('GitHub 토큰이 맞지 않거나 권한이 없어요.');
      return r.ok ? r.json().then(function (j) { return j.sha; }) : null;
    }).then(function (sha) {
      return encryptToken(tok, pw).then(function (blob) {
        var body = { message: 'Update admin key', branch: BRANCH, content: b64encUtf8(JSON.stringify(blob) + '\n') };
        if (sha) body.sha = sha;
        return api('PUT', 'contents/' + ADMIN_PATH, body);
      });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'GitHub 토큰이 맞지 않거나 권한이 없어요.' : '저장하지 못했어요 (' + r.status + ').');
    }).catch(function (err) { memToken = prev; throw err; });
  }

  /* ---------- small login box ---------- */
  var login = null;
  function buildLogin() {
    login = document.createElement('div');
    login.className = 'jj-modal';
    login.hidden = true;
    login.innerHTML =
      '<form class="jj-login" novalidate>' +
      '<button type="button" class="jj-modal-close" aria-label="닫기">&times;</button>' +
      '<p class="jj-login-title">admin</p>' +
      '<div class="jj-login-main"><input type="password" name="pw" placeholder="비밀번호" autocomplete="current-password" aria-label="비밀번호"></div>' +
      '<div class="jj-login-setup" hidden>' +
      '<p class="jj-login-note"></p>' +
      '<input type="password" name="tok" placeholder="GitHub 토큰 (github_pat_…)" autocomplete="off" aria-label="GitHub 토큰">' +
      '<input type="password" name="pw1" placeholder="새 비밀번호" autocomplete="new-password" aria-label="새 비밀번호">' +
      '<input type="password" name="pw2" placeholder="새 비밀번호 확인" autocomplete="new-password" aria-label="새 비밀번호 확인">' +
      '</div>' +
      '<button type="submit" class="jj-login-ok">확인</button>' +
      '<p class="jj-login-status" role="status"></p>' +
      '<button type="button" class="jj-login-forgot">비밀번호를 잊었어요</button>' +
      '</form>';
    document.body.appendChild(login);
    login.addEventListener('click', function (e) {
      if (e.target === login || e.target.closest('.jj-modal-close')) login.hidden = true;
    });
    login.querySelector('.jj-login-forgot').addEventListener('click', function () { setLoginMode('reset'); });
    login.querySelector('form').addEventListener('submit', submitLogin);
  }
  var loginMode = 'login';
  function setLoginMode(mode) {
    loginMode = mode;
    var setup = mode !== 'login';
    login.querySelector('.jj-login-main').hidden = setup;
    login.querySelector('.jj-login-setup').hidden = !setup;
    login.querySelector('[name=tok]').hidden = mode === 'change';
    login.querySelector('.jj-login-forgot').hidden = setup;
    login.querySelector('.jj-login-note').textContent =
      mode === 'setup' ? '처음 한 번만 설정해요.' :
      mode === 'reset' ? 'GitHub 토큰으로 새 비밀번호를 정해요.' : '새 비밀번호를 정해요.';
    login.querySelector('.jj-login-status').textContent = '';
    var first = setup ? login.querySelector(mode === 'change' ? '[name=pw1]' : '[name=tok]') : login.querySelector('[name=pw]');
    setTimeout(function () { first.focus(); }, 0);
  }
  function openLogin(mode) {
    if (!login) buildLogin();
    login.querySelector('form').reset();
    login.hidden = false;
    if (mode) { setLoginMode(mode); return; }
    setLoginMode('login');
    fetchAdminBlob().then(function (blob) { if (!blob) setLoginMode('setup'); });
  }
  function submitLogin(e) {
    e.preventDefault();
    var f = e.target;
    var st = login.querySelector('.jj-login-status');
    var btn = login.querySelector('.jj-login-ok');
    function fail(msg) { st.textContent = msg; btn.disabled = false; }
    btn.disabled = true;
    if (loginMode === 'login') {
      var pw = f.pw.value;
      if (!pw) return fail('비밀번호를 입력해 주세요.');
      st.textContent = '확인하는 중…';
      fetchAdminBlob().then(function (blob) {
        if (!blob) { setLoginMode('setup'); btn.disabled = false; return; }
        return decryptToken(blob, pw).then(function (tok) {
          setToken(tok);
          location.href = 'gallery.html?admin';
        }, function () { fail('비밀번호가 맞지 않아요.'); });
      });
      return;
    }
    var tok = loginMode === 'change' ? token() : f.tok.value.trim();
    var p1 = f.pw1.value, p2 = f.pw2.value;
    if (!tok) return fail('GitHub 토큰을 입력해 주세요.');
    if (p1.length < 8) return fail('비밀번호는 8자 이상으로 정해 주세요.');
    if (p1 !== p2) return fail('새 비밀번호가 서로 달라요.');
    st.textContent = '저장하는 중…';
    saveAdminBlob(tok, p1).then(function () {
      setToken(tok);
      if (loginMode === 'change') { login.hidden = true; status('비밀번호를 바꿨어요.'); btn.disabled = false; return; }
      location.href = 'gallery.html?admin';
    }).catch(function (err) { fail(err.message); });
  }

  var form = null;
  function buildForm() {
    form = document.createElement('div');
    form.className = 'jj-modal';
    form.hidden = true;
    form.innerHTML =
      '<form class="jj-form" novalidate>' +
      '<h2 class="jj-form-title">작품 추가</h2>' +
      '<div class="jj-form-images"><span>사진 (최대 4장 · 1번이 대표 사진)</span><span style="font-size:11px;color:#8A8A8A">권장 크기 2400 × 3000px (최소 1200 × 1500px) · JPG·PNG·SVG·GIF (GIF는 움직임 그대로, ' + GIF_MAX_MB + 'MB까지)</span>' +
      [1, 2, 3, 4].map(function (n) {
        return '<div class="jj-slot" data-slot="' + (n - 1) + '"><span class="jj-slot-no">' + n + '</span><span class="jj-slot-thumb"></span>' +
          '<input type="file" name="image' + n + '" accept="image/*,.svg,.gif" aria-label="사진 ' + n + '">' +
          '<label class="jj-slot-del"><input type="checkbox" name="del' + n + '"> 지우기</label></div>';
      }).join('') + '</div>' +
      '<label>제목 <input type="text" name="title" required></label>' +
      '<div class="jj-form-fit"><span>목록 썸네일</span>' +
        '<label><input type="radio" name="fit" value="cover" checked> 꽉 채우기 <small>(세로형 · 4:5가 아니면 가장자리가 잘려요)</small></label>' +
        '<label><input type="radio" name="fit" value="contain"> 전체 보기 <small>(가로형 · 잘리지 않고 남는 곳은 흰색)</small></label></div>' +
      '<label>연도 <input type="text" name="year" placeholder="2026"></label>' +
      '<label>설명 <textarea name="description" rows="6"></textarea></label>' +
      '<div class="jj-form-actions"><button type="button" class="jj-cancel">취소</button><button type="submit" class="jj-submit">저장</button></div>' +
      '<p class="jj-form-status" role="status"></p>' +
      '</form>';
    document.body.appendChild(form);
    form.querySelector('.jj-cancel').addEventListener('click', function () { form.hidden = true; });
    form.querySelector('form').addEventListener('submit', submitForm);
  }

  var editing = -1;
  function openForm(i) {
    editing = i;
    var f = form.querySelector('form');
    f.reset();
    form.querySelector('.jj-form-title').textContent = i >= 0 ? '작품 수정' : '작품 추가';
    form.querySelector('.jj-form-status').textContent = '';
    var olds = i >= 0 ? imagesOf(works[i]) : [];
    form.querySelectorAll('.jj-slot').forEach(function (slot, k) {
      var th = slot.querySelector('.jj-slot-thumb');
      th.innerHTML = olds[k] ? '<img src="' + esc(imgSrc(olds[k])) + '" alt="">' : '';
      slot.querySelector('.jj-slot-del').hidden = !olds[k];
    });
    if (i >= 0) {
      f.title.value = works[i].title || '';
      f.year.value = works[i].year || '';
      f.description.value = works[i].description || '';
    }
    f.querySelector('input[name=fit][value=' + (i >= 0 && works[i].fit === 'contain' ? 'contain' : 'cover') + ']').checked = true;
    form.hidden = false;
    f.title.focus();
  }

  function submitForm(e) {
    e.preventDefault();
    if (!token()) { openLogin(); return; }
    var f = e.target;
    var st = form.querySelector('.jj-form-status');
    var title = f.title.value.trim();
    if (!title) { st.textContent = '제목을 입력해 주세요.'; return; }
    var olds = editing >= 0 ? imagesOf(works[editing]) : [];
    var slots = [0, 1, 2, 3].map(function (k) {
      return { file: f['image' + (k + 1)].files[0] || null, del: f['del' + (k + 1)].checked, old: olds[k] || null };
    });
    var willHave = slots.some(function (x) { return x.file || (x.old && !x.del); });
    if (!willHave) { st.textContent = '사진을 한 장 이상 올려 주세요.'; return; }
    var bigGif = slots.filter(function (x) { return x.file && isGif(x.file) && x.file.size > GIF_MAX_MB * 1024 * 1024; });
    if (bigGif.length) { st.textContent = 'GIF는 ' + GIF_MAX_MB + 'MB까지 올릴 수 있어요. (' + bigGif.map(function (x) { return x.file.name + ' ' + (x.file.size / 1048576).toFixed(1) + 'MB'; }).join(', ') + ')'; return; }
    var btn = form.querySelector('.jj-submit');
    btn.disabled = true;
    st.textContent = '저장하는 중이에요…';
    var small = [];
    var done = 0, total = slots.filter(function (x) { return x.file; }).length;
    /* 사진을 한 장씩 차례로 올려요 */
    var chain = Promise.resolve();
    var result = [];
    var newThumbs = {};
    var oldCover = olds[0] || null, oldThumb = editing >= 0 ? (works[editing].thumb || null) : null;
    slots.forEach(function (x, k) {
      chain = chain.then(function () {
        if (x.file) {
          st.textContent = '사진 올리는 중… (' + (done + 1) + '/' + total + ')';
          return uploadImage(x.file).then(function (up) {
            var path = up.path;
            if (up.thumbB64) newThumbs[path] = up.thumbB64;
            done++;
            if (lastImageSize && Math.min(lastImageSize[0], lastImageSize[1]) < 1000) small.push((k + 1) + '번(' + lastImageSize[0] + '×' + lastImageSize[1] + 'px)');
            result[k] = path;
          });
        }
        result[k] = x.del ? null : x.old;
      });
    });
    var paths, thumb = null;
    chain.then(function () {
      paths = result.filter(Boolean);
      /* 목록에 보이는 작은 사진: 대표 사진이 그대로면 예전 것을 쓰고, 바뀌었으면 새로 만들어요 */
      var cover = paths[0];
      if (cover === oldCover && oldThumb) return oldThumb;
      st.textContent = '목록용 사진 만드는 중…';
      if (newThumbs[cover]) return putFile(cover.replace(/\.jpg$/i, '') + '-t.jpg', newThumbs[cover], 'Add work thumbnail').catch(function () { return null; });
      return thumbFromExisting(cover);
    }).then(function (t) {
      thumb = t || null;
      var item = { id: editing >= 0 ? works[editing].id : String(Date.now()), title: title, year: f.year.value.trim(), image: paths[0], images: paths, fit: f.querySelector('input[name=fit]:checked').value, description: f.description.value.trim() };
      if (thumb) item.thumb = thumb;
      var isEdit = editing >= 0;
      st.textContent = '저장하는 중이에요…';
      return saveJson((isEdit ? 'Update work: ' : 'Add work: ') + title, function (list) {
        var k = list.findIndex(function (x) { return x.id === item.id; });
        if (k >= 0) list[k] = item; else list.unshift(item);
      }).then(function () {
        /* 바뀌거나 지운 예전 사진 정리 */
        var gone = olds.filter(function (o) { return paths.indexOf(o) < 0; });
        if (oldThumb && oldThumb !== thumb) gone.push(oldThumb);
        return gone.reduce(function (p, o) { return p.then(function () { return deleteImage(o); }); }, Promise.resolve());
      });
    }).then(function () {
      form.hidden = true;
      page = 1;
      render();
      status(small.length ? '저장했어요. 다만 ' + small.join(', ') + ' 사진이 작아서 확대하면 흐릴 수 있어요. 2400×3000px 이상을 권장해요.' : '저장했어요. 실제 홈페이지에는 1~2분 뒤에 반영돼요.', small.length > 0);
    }).catch(function (err) {
      st.textContent = err.message;
    }).then(function () { btn.disabled = false; });
  }

  function adminAction(act, i) {
    if (!token()) { openLogin(); return; }
    if (act === 'add') { openForm(-1); return; }
    if (act === 'edit') { openForm(i); return; }
    var msg;
    if (act === 'del') {
      if (!confirm('"' + works[i].title + '" 작품을 삭제할까요?')) return;
      var removed = works[i];
      msg = 'Remove work: ' + removed.title;
      status('삭제하는 중이에요…');
      saveJson(msg, function (list) {
        var k = list.findIndex(function (x) { return x.id === removed.id; });
        if (k >= 0) list.splice(k, 1);
      }).then(function () {
        render();
        return imagesOf(removed).concat(removed.thumb ? [removed.thumb] : []).reduce(function (p, o) { return p.then(function () { return deleteImage(o); }); }, Promise.resolve());
      })
        .then(function () { render(); status('삭제했어요. 실제 홈페이지에는 1~2분 뒤에 반영돼요.'); })
        .catch(function (err) { status(err.message, true); });
      return;
    }
    var j = act === 'left' ? i - 1 : i + 1;
    if (j < 0 || j >= works.length) return;
    var idA = works[i].id, idB = works[j].id;
    status('순서를 저장하는 중이에요…');
    saveJson('Reorder works', function (list) {
      var a = list.findIndex(function (x) { return x.id === idA; });
      var b = list.findIndex(function (x) { return x.id === idB; });
      if (a < 0 || b < 0) return;
      var t = list[a]; list[a] = list[b]; list[b] = t;
    }).then(function () { render(); status('순서를 저장했어요.'); })
      .catch(function (err) { status(err.message, true); });
  }

  /* ---------- start ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.jj-admin-link');
    if (!a) return;
    e.preventDefault();
    if (token()) { location.href = 'gallery.html?admin'; return; }
    openLogin();
  });
  if (wantAdmin && token()) { isAdmin = true; buildAdminBar(); buildForm(); }
  else if (wantAdmin) { openLogin(); }
  load().then(render).catch(function (err) { status(err.message, true); render(); });
})();
