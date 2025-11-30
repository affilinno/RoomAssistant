// State
let currentUser = null;
let allGenres = [];
// GASのURLをハードコーディング
const API_URL = 'https://script.google.com/macros/s/AKfycbzH9Suwl6xCdn25LcrHIZ3vOwwR9Jm_2r4CnhrvWXAaqdQouXH5eYNvdFI7TCfldInbvQ/exec';

// Init
window.onload = function () {
    // API URLチェック
    if (API_URL.includes('YOUR_SCRIPT_ID_HERE') || API_URL === '') {
        alert('【重要】script.jsのAPI_URLが正しく設定されていません。\nGASをデプロイし、発行されたURLをscript.jsのAPI_URLに書き写してください。');
        return;
    }

    const savedUser = localStorage.getItem('room_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (!currentUser.plan) currentUser.plan = 'Free';
        if (!currentUser.priceMin) currentUser.priceMin = '';
        if (!currentUser.priceMax) currentUser.priceMax = '';
        showDashboard();
    } else {
        showLogin();
    }
    loadGenres();
};

// API Helper
async function callApi(action, params = {}, method = 'POST') {
    let url = API_URL;
    let options = {
        method: method,
        redirect: 'follow'
    };

    if (method === 'GET') {
        const query = new URLSearchParams({ action, ...params }).toString();
        url += (url.includes('?') ? '&' : '?') + query;
    } else {
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = JSON.stringify({ action, ...params });
    }

    try {
        const res = await fetch(url, options);
        const text = await res.text();

        try {
            const json = JSON.parse(text);
            return json;
        } catch (e) {
            console.error('JSON Parse Error:', text);
            throw new Error('サーバーエラー（HTMLが返されました）: ' + text.substring(0, 100) + '...');
        }
    } catch (err) {
        console.error('API Error:', err);
        throw err;
    }
}

// Load Genres
async function loadGenres() {
    try {
        const res = await callApi('getGenres', {}, 'GET');
        if (res.success) {
            allGenres = res.data;
            populateGenreSelects();
        }
    } catch (err) {
        console.error('ジャンル読み込みエラー:', err);
    }
}

function populateGenreSelects() {
    const rankingSelect = document.getElementById('ranking-genre');

    if (rankingSelect) {
        rankingSelect.innerHTML = allGenres.map(g =>
            `<option value="${g.id}">${g.name}</option>`
        ).join('');
    }
}

// Navigation
function showLogin() {
    hideAll();
    document.getElementById('login-view').classList.remove('hidden');
}

function showRegister() {
    hideAll();
    document.getElementById('register-view').classList.remove('hidden');
}

function showDashboard() {
    hideAll();
    document.getElementById('dashboard-view').style.display = 'block';
    document.getElementById('app-header').classList.remove('hidden');
    document.getElementById('header-email').textContent = currentUser.email;

    updatePremiumUI();

    if (currentUser.plan === 'Premium') {
        loadRandomGenres();
    } else {
        loadDashboardData();
    }
}

function hideAll() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.add('hidden');
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('app-header').classList.add('hidden');
}

function logout() {
    localStorage.removeItem('room_user');
    currentUser = null;
    showLogin();
}

function goToRandom() {
    if (currentUser.plan === 'Premium') {
        switchTab('random');
        loadRandomGenres();
    } else {
        loadDashboardData();
    }
}

function showSettings() {
    const modal = document.getElementById('settings-modal');
    modal.style.display = 'flex';

    const isPremium = currentUser.plan === 'Premium';

    const radios = document.getElementsByName('plan');
    for (const radio of radios) {
        if (radio.value === (isPremium ? 'Premium' : 'Free')) {
            radio.checked = true;
        }
    }

    document.getElementById('custom-prompt').value = currentUser.customPrompt || '';
    document.getElementById('settings-min-price').value = currentUser.priceMin || '';
    document.getElementById('settings-max-price').value = currentUser.priceMax || '';

    updateSettingsUI(isPremium);
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function togglePlan() {
    const selected = document.querySelector('input[name="plan"]:checked').value;
    const isPremium = selected === 'Premium';
    updateSettingsUI(isPremium);
}

function updateSettingsUI(isPremium) {
    const premiumSettings = document.getElementById('premium-settings');
    if (isPremium) {
        premiumSettings.classList.remove('hidden');
    } else {
        premiumSettings.classList.add('hidden');
    }
}

function updatePremiumUI() {
    const isPremium = currentUser.plan === 'Premium';
    const toolbar = document.getElementById('premium-toolbar');
    const promoBanner = document.getElementById('premium-promo');
    const homeRefresh = document.getElementById('home-refresh');

    if (isPremium) {
        toolbar.classList.remove('hidden');
        promoBanner.classList.add('hidden');
        homeRefresh.classList.add('hidden');

        const rankingMin = document.getElementById('ranking-min-price');
        const rankingMax = document.getElementById('ranking-max-price');
        const searchMin = document.getElementById('search-min-price');
        const searchMax = document.getElementById('search-max-price');

        if (rankingMin) rankingMin.value = currentUser.priceMin || '';
        if (rankingMax) rankingMax.value = currentUser.priceMax || '';
        if (searchMin) searchMin.value = currentUser.priceMin || '';
        if (searchMax) searchMax.value = currentUser.priceMax || '';
    } else {
        toolbar.classList.add('hidden');
        promoBanner.classList.remove('hidden');
        homeRefresh.classList.remove('hidden');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });

    const target = document.getElementById(`tab-${tabId}`);
    target.classList.remove('hidden');
    target.classList.add('active');

    if (tabId === 'random') {
        loadRandomGenres();
    }
}

// Handlers
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    btn.disabled = true;
    btn.textContent = 'ログイン中...';

    try {
        const res = await callApi('login', { email, password: pass });
        if (res.success) {
            currentUser = res.user;
            localStorage.setItem('room_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            showToast(res.message);
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'ログイン';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const btn = document.getElementById('reg-btn');

    btn.disabled = true;
    btn.textContent = '送信中...';

    try {
        const res = await callApi('register', { email, password: pass });
        alert(res.message);
        if (res.success) {
            showLogin();
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '確認メールを送信';
    }
}

async function saveSettings() {
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    const selected = document.querySelector('input[name="plan"]:checked').value;
    const plan = selected;
    const customPrompt = document.getElementById('custom-prompt').value;
    const priceMin = document.getElementById('settings-min-price').value;
    const priceMax = document.getElementById('settings-max-price').value;

    try {
        const res = await callApi('updateProfile', {
            email: currentUser.email,
            plan: plan,
            customPrompt: customPrompt,
            priceMin: priceMin,
            priceMax: priceMax
        });

        if (res.success) {
            currentUser = res.user;
            localStorage.setItem('room_user', JSON.stringify(currentUser));
            showToast('設定を保存しました');
            closeSettings();
            updatePremiumUI();

            if (currentUser.plan === 'Premium') {
                loadRandomGenres();
            } else {
                loadDashboardData();
            }
        } else {
            showToast(res.message);
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '保存する';
    }
}

async function loadRankingByGenre() {
    const genreId = document.getElementById('ranking-genre').value;
    const genreName = document.getElementById('ranking-genre').options[document.getElementById('ranking-genre').selectedIndex].text;
    const minPrice = document.getElementById('ranking-min-price').value;
    const maxPrice = document.getElementById('ranking-max-price').value;
    const container = document.getElementById('dashboard-content');

    await updatePriceSettings(minPrice, maxPrice);

    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">ランキング読み込み中...</div>';

    try {
        const res = await callApi('getRanking', { genreId, minPrice, maxPrice }, 'GET');
        if (res.success) {
            container.innerHTML = '';
            if (res.data.length > 0) {
                let header = `${genreName} ランキング`;
                if (minPrice || maxPrice) {
                    header += ` (${minPrice || '0'}円〜${maxPrice || '上限なし'}円)`;
                }
                renderGenreSection(container, header, res.data);
            } else {
                container.innerHTML = '<div style="text-align:center; padding:2rem;">該当する商品がありませんでした。価格帯を変更してみてください。</div>';
            }
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center">読み込みエラー: ${err.message}</div>`;
    }
}

async function loadRandomGenres() {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">ランダムジャンル読み込み中...</div>';

    const minPrice = currentUser.priceMin || '';
    const maxPrice = currentUser.priceMax || '';

    try {
        const res = await callApi('getDashboardData', { minPrice, maxPrice }, 'GET');
        if (res.success) {
            container.innerHTML = '';
            Object.keys(res.data).forEach(genre => {
                if (res.data[genre].length > 0) {
                    renderGenreSection(container, genre, res.data[genre]);
                }
            });
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center">読み込みエラー: ${err.message}</div>`;
    }
}

async function handleSearch(e, type) {
    e.preventDefault();
    const container = document.getElementById('dashboard-content');
    let keyword = '';
    let message = '';
    let minPrice = 0;
    let maxPrice = 0;

    if (type === 'keyword') {
        keyword = document.getElementById('search-keyword').value;
        minPrice = document.getElementById('search-min-price').value;
        maxPrice = document.getElementById('search-max-price').value;

        await updatePriceSettings(minPrice, maxPrice);

        message = `検索結果: ${keyword}`;
        if (minPrice || maxPrice) {
            message += ` (${minPrice || '0'}円〜${maxPrice || '上限なし'}円)`;
        }
    } else if (type === 'url') {
        const rawInput = document.getElementById('search-url').value.trim();

        const urlPattern = /https?:\/\/(?:item\.)?rakuten\.co\.jp\/[^\s\n\r]*/i;
        const urlMatch = rawInput.match(urlPattern);

        if (urlMatch) {
            keyword = urlMatch[0];
            document.getElementById('search-url').value = keyword;
            showToast('URLを抽出しました');
        } else {
            const generalUrlPattern = /https?:\/\/[^\s\n\r]+/;
            const generalMatch = rawInput.match(generalUrlPattern);
            if (generalMatch) {
                keyword = generalMatch[0];
                document.getElementById('search-url').value = keyword;
                showToast('URLを抽出しました');
            } else {
                keyword = rawInput;
            }
        }

        message = 'URL検索結果';
    }

    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">商品を検索中...</div>';

    try {
        const res = await callApi('searchItems', { keyword, genreId: '', minPrice, maxPrice });
        if (res.success) {
            container.innerHTML = '';
            if (res.data.length > 0) {
                renderGenreSection(container, message, res.data);
                if (type === 'url' && res.data.length === 1) {
                    openItemModal(res.data[0]);
                }
            } else {
                container.innerHTML = '<div style="text-align:center; padding:2rem;">該当する商品が見つかりませんでした。</div>';
            }
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center">検索エラー: ${err.message}</div>`;
    }
}

async function updatePriceSettings(minPrice, maxPrice) {
    if ((minPrice || '') !== (currentUser.priceMin || '') || (maxPrice || '') !== (currentUser.priceMax || '')) {
        try {
            const res = await callApi('updateProfile', {
                email: currentUser.email,
                plan: currentUser.plan,
                customPrompt: currentUser.customPrompt,
                priceMin: minPrice,
                priceMax: maxPrice
            });

            if (res.success) {
                currentUser = res.user;
                localStorage.setItem('room_user', JSON.stringify(currentUser));

                const rankingMin = document.getElementById('ranking-min-price');
                const rankingMax = document.getElementById('ranking-max-price');
                const searchMin = document.getElementById('search-min-price');
                const searchMax = document.getElementById('search-max-price');

                if (rankingMin) rankingMin.value = minPrice || '';
                if (rankingMax) rankingMax.value = maxPrice || '';
                if (searchMin) searchMin.value = minPrice || '';
                if (searchMax) searchMax.value = maxPrice || '';
            }
        } catch (err) {
            console.error('価格設定更新エラー:', err);
        }
    }
}

async function loadDashboardData() {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">商品を読み込み中...</div>';

    const minPrice = currentUser.plan === 'Premium' ? (currentUser.priceMin || '') : '';
    const maxPrice = currentUser.plan === 'Premium' ? (currentUser.priceMax || '') : '';

    try {
        const res = await callApi('getDashboardData', { minPrice, maxPrice }, 'GET');
        if (res.success) {
            container.innerHTML = '';
            Object.keys(res.data).forEach(genre => {
                if (res.data[genre].length > 0) {
                    renderGenreSection(container, genre, res.data[genre]);
                }
            });
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center">読み込みエラー: ${err.message}</div>`;
    }
}

function renderGenreSection(container, genreName, items) {
    const section = document.createElement('div');
    section.innerHTML = `
    <div class="section-header">
      ${genreName} 
    </div>
    <div class="grid">
      ${items.map((item, idx) => `
        <div class="card" onclick='openItemModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'>
          <img src="${item.imageUrl}" class="card-img" loading="lazy">
          <div class="card-body">
            <div class="card-title">${item.name}</div>
            <div class="card-price">${parseInt(item.price).toLocaleString()}円</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
    container.appendChild(section);
}

function openItemModal(item) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');
    modal.style.display = 'flex';

    content.innerHTML = `
    <div style="text-align:center">
      <img src="${item.imageUrl}" style="max-height:200px; border-radius:8px;">
      <h3 style="font-size:1rem; margin:1rem 0;">${item.name}</h3>
    </div>
    <div class="loading-spinner"></div>
    <div style="text-align:center; color:#666;">AI紹介文を生成中...</div>
  `;

    const customPrompt = currentUser.plan === 'Premium' ? currentUser.customPrompt : '';

    callApi('generateRecommendation', { itemName: item.name, customPrompt: customPrompt })
        .then(res => {
            if (!res.success) throw new Error(res.message);

            const text = res.data;
            // ROOM URLの正しい形式（/itemsなし）
            const roomUrl = `https://room.rakuten.co.jp/mix?itemcode=${encodeURIComponent(item.code)}&scid=we_room_upc60`;

            content.innerHTML = `
        <div style="text-align:center; margin-bottom:1rem;">
          <img src="${item.imageUrl}" style="max-height:150px; border-radius:8px;">
          <h3 style="font-size:1rem; margin:0.5rem 0;">${item.name}</h3>
        </div>
        
        <label style="font-weight:bold; font-size:0.9rem;">AI生成紹介文:</label>
        <div class="generated-text" id="copy-target">${text}</div>
        
        <div style="display:flex; gap:1rem; flex-direction:column;">
          <button class="btn" onclick="copyAndOpen('${roomUrl}')">
            紹介文をコピーしてROOMへ
          </button>
          <button class="btn" style="background:#666;" onclick="closeModal()">閉じる</button>
        </div>
      `;
        })
        .catch(err => {
            content.innerHTML += `<div style="color:red; text-align:center; margin-top:1rem;">エラー: ${err.message}</div>`;
        });
}

function copyAndOpen(url) {
    const text = document.getElementById('copy-target').innerText;

    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('コピーしました！ROOMを開きます...');
            window.location.href = url;
        })
        .catch(err => {
            console.error('Copy failed', err);
            showToast('コピーに失敗しました。手動でコピーしてください。');
            window.location.href = url;
        });
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function extractUrlFromInput() {
    const input = document.getElementById('search-url');
    const rawValue = input.value;

    if (!rawValue || rawValue.startsWith('http')) return;

    const urlPattern = /https?:\/\/(?:item\.)?rakuten\.co\.jp\/[^\s\n\r]*/i;
    const urlMatch = rawValue.match(urlPattern);

    if (urlMatch) {
        input.value = urlMatch[0];
    } else {
        const generalUrlPattern = /https?:\/\/[^\s\n\r]+/;
        const generalMatch = rawValue.match(generalUrlPattern);
        if (generalMatch) {
            input.value = generalMatch[0];
        }
    }
}

document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
});
