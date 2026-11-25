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
  function resizeToJpegBase64(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2400, w = img.naturalWidth, h = img.naturalHeight;
        lastImageSize = [w, h];
        var k = Math.min(1, max / Math.max(w, h));
        var tw = Math.round(w * k), th = Math.round(h * k);
        /* 여러 단계로 나눠 줄여서 글자·선이 뭉개지지 않게 */
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
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
      };
      img.onerror = function () { reject(new Error('이미지를 읽지 못했어요.')); };
      img.src = url;
    });
  }

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했어요.')); };
      fr.readAsDataURL(file);
    });
  }
  function isSvg(file) { return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name); }
  function uploadImage(file) {
    var svg = isSvg(file);
    var path = 'assets/works/' + Date.now() + (svg ? '.svg' : '.jpg');
    if (svg) lastImageSize = null;
    /* SVG는 벡터 그대로 저장해서 확대해도 선명해요. 나머지는 고화질 JPG로 저장해요. */
    return (svg ? readAsBase64(file) : resizeToJpegBase64(file)).then(function (b64) {
      return api('PUT', 'contents/' + path, { message: 'Add work image', branch: BRANCH, content: b64 });
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error('이미지 업로드 실패: ' + (e.message || r.status)); });
      return path;
    });
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

  /* ---------- render ---------- */
  function tileHTML(w, idx) {
    var img = w.image
      ? '<img src="' + esc(imgSrc(w.image)) + '" alt="' + esc(w.title) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block">'
      : '<span style="display:flex;flex-direction:column;align-items:center;gap:8px">' + "<svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#C8C8C8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' role='img' aria-label='작업 이미지 자리'><rect x='3' y='4' width='18' height='16' rx='2'></rect><circle cx='9' cy='10' r='1.8'></circle><path d='M21 16.5 15.5 11 6 20'></path></svg>" + '<span style="font-size:10px;letter-spacing:0.04em;color:#BDBDBD">2400 × 3000px</span></span>';
    var admin = isAdmin
      ? '<div class="work-admin"><button type="button" data-act="left" data-i="' + idx + '" aria-label="앞으로">&larr;</button>' +
        '<button type="button" data-act="right" data-i="' + idx + '" aria-label="뒤로">&rarr;</button>' +
        '<button type="button" data-act="edit" data-i="' + idx + '">수정</button>' +
        '<button type="button" data-act="del" data-i="' + idx + '">삭제</button></div>'
      : '';
    return '<div class="work-cell"><a href="#" class="work" data-i="' + idx + '" style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="position:relative;aspect-ratio:4 / 5">' +
      '<div class="work-img" style="position:absolute;inset:0;background:rgba(237, 230, 218, 0.5);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:opacity 0.25s">' + img + '</div>' +
      '<div class="work-hover" aria-hidden="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;color:#FF4500;font-size:14px;font-weight:400;transition:opacity 0.25s">' + esc(w.title) + '</div>' +
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

  function openWork(w) {
    lastFocus = document.activeElement;
    modal.querySelector('.jj-modal-img').innerHTML = w.image
      ? '<div class="jj-modal-img-inner"><img src="' + esc(imgSrc(w.image)) + '" alt="' + esc(w.title) + '"></div>'
      : '<div class="jj-modal-img-inner">' + "<svg width='36' height='36' viewBox='0 0 24 24' fill='none' stroke='#C8C8C8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' role='img' aria-label='작업 이미지 자리'><rect x='3' y='4' width='18' height='16' rx='2'></rect><circle cx='9' cy='10' r='1.8'></circle><path d='M21 16.5 15.5 11 6 20'></path></svg>" + '</div>';
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
  /* 팝업 이미지 호버 확대 (1.5배, 마우스 위치 기준) */
  var zoomBox = modal.querySelector('.jj-modal-img');
  zoomBox.addEventListener('mousemove', function (e) {
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
    if (e.target === modal || e.target.closest('.jj-modal-close')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (btn) { e.preventDefault(); adminAction(btn.getAttribute('data-act'), parseInt(btn.getAttribute('data-i'), 10)); return; }
    var a = e.target.closest('a.work');
    if (!a) return;
    e.preventDefault();
    var i = a.getAttribute('data-i');
    if (i == null) {
      openWork({ title: a.querySelector('.work-hover') ? a.querySelector('.work-hover').textContent : '', year: '', description: '' });
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
      '<label>이미지 <span style="font-size:11px;color:#8A8A8A">권장 크기 2400 × 3000px (최소 1200 × 1500px) · JPG·PNG·SVG · 다른 비율은 가운데 기준으로 잘려 보여요</span><input type="file" name="image" accept="image/*,.svg"></label>' +
      '<label>제목 <input type="text" name="title" required></label>' +
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
    if (i >= 0) {
      f.title.value = works[i].title || '';
      f.year.value = works[i].year || '';
      f.description.value = works[i].description || '';
    }
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
    var file = f.image.files[0];
    if (editing < 0 && !file) { st.textContent = '이미지를 선택해 주세요.'; return; }
    var btn = form.querySelector('.jj-submit');
    btn.disabled = true;
    st.textContent = '저장하는 중이에요…';
    var oldImage = editing >= 0 ? works[editing].image : null;
    (file ? uploadImage(file) : Promise.resolve(oldImage)).then(function (path) {
      var item = { id: editing >= 0 ? works[editing].id : String(Date.now()), title: title, year: f.year.value.trim(), image: path, description: f.description.value.trim() };
      var isEdit = editing >= 0;
      return saveJson((isEdit ? 'Update work: ' : 'Add work: ') + title, function (list) {
        var k = list.findIndex(function (x) { return x.id === item.id; });
        if (k >= 0) list[k] = item; else list.unshift(item);
      }).then(function () {
        if (file && oldImage && oldImage !== path) return deleteImage(oldImage);
      });
    }).then(function () {
      form.hidden = true;
      page = 1;
      render();
      var small = file && lastImageSize && Math.min(lastImageSize[0], lastImageSize[1]) < 1000;
      status(small ? '저장했어요. 다만 원본 사진이 작아서(' + lastImageSize[0] + '×' + lastImageSize[1] + 'px) 확대하면 흐릴 수 있어요. 2400×3000px 이상을 권장해요.' : '저장했어요. 실제 홈페이지에는 1~2분 뒤에 반영돼요.', small);
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
      }).then(function () { render(); return deleteImage(removed.image); })
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
