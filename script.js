// State
//let currentUser = null;
//let allGenres = [];
// GASのURLをハードコーディング
const API_URL = 'https://script.google.com/macros/s/AKfycbwq43O8qLK0wMkFAwDzr5fLPm7T6g0qRMjtxtQOoWPbmtg7Ew-tts5rfVwRZ24y8HOBJw/exec';

// 状態管理
let currentUser = null;
let currentTab = 'random';

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    checkStripeCallback();
});


function checkLogin() {
    const userJson = localStorage.getItem('room_user');
    if (userJson) {
        currentUser = JSON.parse(userJson);
        showDashboard();
    } else {
        showLogin();
    }
}

// Stripeからのコールバック処理
async function checkStripeCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const sessionId = urlParams.get('session_id');

    if (success === 'true' && sessionId) {
        // 決済成功通知
        showToast('決済を処理中です。しばらくお待ちください...');

        // URLパラメータをクリーンに
        window.history.replaceState({}, document.title, window.location.pathname);

        // Stripe同期を実行してユーザー情報を再取得
        try {
            // Webhookが処理されるまで少し待機
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Stripe情報を同期
            const syncResult = await callApi('syncWithStripe', {
                email: currentUser ? currentUser.email : null
            });

            if (syncResult.success && syncResult.user) {
                currentUser = syncResult.user;
                localStorage.setItem('room_user', JSON.stringify(currentUser));

                // UIを更新
                updatePremiumUI();

                // Premiumプランになっていたら成功メッセージ
                if (currentUser.plan === 'Premium') {
                    showToast('✅ Premiumプランへのアップグレードが完了しました！');

                    // ダッシュボードを再読み込み
                    if (currentUser.plan === 'Premium') {
                        switchTab('random');
                    }
                } else {
                    showToast('決済を確認しました。反映までしばらくお待ちください。');
                }
            } else {
                showToast('決済を確認しました。反映までしばらくお待ちください。');
            }
        } catch (err) {
            console.error('Stripe同期エラー:', err);
            showToast('決済を確認しました。反映までしばらくお待ちください。');
        }
    } else if (success === 'false') {
        showToast('決済がキャンセルされました。');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// === 画面切り替え ===

function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('register-view').classList.add('hidden');
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('app-header').classList.add('hidden');
}

function showRegister() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.remove('hidden');
}

function showDashboard() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.add('hidden');
    document.getElementById('dashboard-view').style.display = 'block';
    document.getElementById('app-header').classList.remove('hidden');

    document.getElementById('header-email').textContent = currentUser.email;

    updatePremiumUI();

    // 初期タブのロード
    if (currentUser.plan === 'Premium') {
        switchTab('random');
    } else {
        loadDashboardData();
    }
}

// === 認証処理 ===

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    btn.disabled = true;
    btn.textContent = 'ログイン中...';

    try {
        const res = await callApi('login', { email, password });
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
    const password = document.getElementById('reg-password').value;
    const btn = document.getElementById('reg-btn');

    btn.disabled = true;
    btn.textContent = '送信中...';

    try {
        const res = await callApi('register', { email, password });
        if (res.success) {
            alert(res.message);
            showLogin();
        } else {
            showToast(res.message);
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '確認メールを送信';
    }
}

function logout() {
    localStorage.removeItem('room_user');
    currentUser = null;
    showLogin();
}

// === 設定モーダル ===

function showSettings() {
    const modal = document.getElementById('settings-modal');
    modal.style.display = 'flex';

    const isPremium = currentUser.plan === 'Premium';

    const radios = document.getElementsByName('plan');
    for (const radio of radios) {
        if (radio.value === (isPremium ? 'Premium' : 'Free')) {
            radio.checked = true;
        }
        // ラジオボタンを無効化（表示専用にする）
        radio.disabled = true;
    }

    document.getElementById('custom-prompt').value = currentUser.customPrompt || '';
    document.getElementById('settings-min-price').value = currentUser.priceMin || '';
    document.getElementById('settings-max-price').value = currentUser.priceMax || '';

    updateSettingsUI(isPremium);
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function updateSettingsUI(isPremium) {
    const premiumSettings = document.getElementById('premium-settings');
    const upgradeButtonContainer = document.getElementById('upgrade-button-container');
    const cancelButtonContainer = document.getElementById('cancel-subscription-container');

    // 解約予約中かどうかのチェック
    const isCanceled = currentUser.cancelAtPeriodEnd === true;

    if (isPremium) {
        premiumSettings.classList.remove('hidden');
        upgradeButtonContainer.classList.add('hidden');

        if (isCanceled) {
            cancelButtonContainer.innerHTML = '<p style="color: #e74c3c; font-weight: bold;">解約予約済み（期間終了までご利用いただけます）</p>';
            cancelButtonContainer.classList.remove('hidden');
        } else {
            // ボタンを再生成してイベントリスナーをセットし直す（innerHTML書き換え対策）
            cancelButtonContainer.innerHTML = '<button class="btn" style="background: #999;" onclick="cancelSubscription()">Premiumプランを解約</button>';
            cancelButtonContainer.classList.remove('hidden');
        }
    } else {
        premiumSettings.classList.add('hidden');
        upgradeButtonContainer.classList.remove('hidden');
        cancelButtonContainer.classList.add('hidden');
    }
}

// ... (中略) ...

/**
 * サブスクリプションをキャンセル
 */
async function cancelSubscription() {
    if (!currentUser || currentUser.plan !== 'Premium') {
        showToast('Premiumプランではありません');
        return;
    }

    if (!confirm('Premiumプランを解約しますか？\n次回の請求日までは引き続きご利用いただけます。')) {
        return;
    }

    try {
        const res = await callApi('cancelSubscription', {
            email: currentUser.email
        });

        if (res.success) {
            showToast(res.message);

            // Stripe情報を同期して最新状態を取得
            const syncResult = await callApi('syncWithStripe', {
                email: currentUser.email
            });

            if (syncResult.success && syncResult.user) {
                currentUser = syncResult.user;
                localStorage.setItem('room_user', JSON.stringify(currentUser));
                updateSettingsUI(true);
            } else {
                // 同期に失敗した場合は手動でフラグを立てる
                currentUser.cancelAtPeriodEnd = true;
                localStorage.setItem('room_user', JSON.stringify(currentUser));
                updateSettingsUI(true);
            }
        } else {
            showToast('エラー: ' + (res.message || '解約に失敗しました'));
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    }
}

async function saveSettings() {
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    const priceMin = document.getElementById('settings-min-price').value || '';
    const priceMax = document.getElementById('settings-max-price').value || '';
    const customPrompt = document.getElementById('custom-prompt').value || '';

    try {
        const res = await callApi('updateSettings', {
            email: currentUser.email,
            priceMin,
            priceMax,
            customPrompt
        });

        if (res.success) {
            currentUser.priceMin = priceMin;
            currentUser.priceMax = priceMax;
            currentUser.customPrompt = customPrompt;
            localStorage.setItem('room_user', JSON.stringify(currentUser));
            showToast('設定を保存しました');
            closeSettings();
        } else {
            showToast('エラー: ' + res.message);
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '保存する';
    }
}

async function upgradeToPremium() {
    if (!currentUser) {
        showToast('ログインしてください');
        return;
    }

    try {
        const res = await callApi('createCheckoutSession', {
            email: currentUser.email
        });

        if (res.success && res.url) {
            // Stripe Checkoutページへリダイレクト
            window.location.href = res.url;
        } else {
            showToast('エラー: ' + (res.message || '決済ページの作成に失敗しました'));
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    }
}

async function reloadUserData() {
    if (!currentUser) return;

    try {
        const res = await callApi('syncWithStripe', {
            email: currentUser.email
        });

        if (res.success && res.user) {
            currentUser = res.user;
            localStorage.setItem('room_user', JSON.stringify(currentUser));
            updatePremiumUI();
            showToast('プラン情報を更新しました');
        }
    } catch (err) {
        console.error('Failed to reload user data:', err);
    }
}

// === ダッシュボード機能 ===

function switchTab(tabName, event) {
    currentTab = tabName;

    // タブボタンの更新
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // eventが存在する場合のみ、クリックされたボタンをアクティブにする
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // eventがない場合（自動切り替え時）は、tabNameに基づいてボタンを探す
        const targetBtn = document.querySelector(`[onclick*="switchTab('${tabName}')"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // コンテンツの更新
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // コンテンツクリア
    document.getElementById('dashboard-content').innerHTML = '';

    if (tabName === 'random') {
        loadRandomGenres();
    } else if (tabName === 'ranking') {
        loadGenres(); // ジャンルリスト読み込み
    }
}

async function loadDashboardData() {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">読み込み中...</div>';

    try {
        const res = await callApi('getDashboardData', {
            minPrice: currentUser.priceMin,
            maxPrice: currentUser.priceMax
        }, 'GET');

        if (res.success) {
            renderDashboard(res.data);
        } else {
            container.innerHTML = `<p class="error-msg">${res.message}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-msg">エラー: ${err.message}</p>`;
    }
}

async function loadRandomGenres() {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center">ランダム商品読み込み中...</div>';

    const minPrice = currentUser.priceMin || '';
    const maxPrice = currentUser.priceMax || '';

    try {
        const res = await callApi('getDashboardData', { minPrice, maxPrice }, 'GET');
        if (res.success) {
            renderDashboard(res.data);
        } else {
            container.innerHTML = `<p class="error-msg">${res.message}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-msg">エラー: ${err.message}</p>`;
    }
}

async function loadGenres() {
    const select = document.getElementById('ranking-genre');
    if (select.options.length > 0) return; // 既に読み込み済みならスキップ

    try {
        const res = await callApi('getGenres', {}, 'GET');
        if (res.success) {
            select.innerHTML = res.data.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadRankingByGenre() {
    const genreId = document.getElementById('ranking-genre').value;
    const genreName = document.getElementById('ranking-genre').options[document.getElementById('ranking-genre').selectedIndex].text;
    const minPrice = document.getElementById('ranking-min-price').value;
    const maxPrice = document.getElementById('ranking-max-price').value;

    const container = document.getElementById('dashboard-content');
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const res = await callApi('getRanking', { genreId, minPrice, maxPrice }, 'GET');
        if (res.success) {
            const data = {};
            data[genreName] = res.data;
            renderDashboard(data);
        } else {
            container.innerHTML = `<p class="error-msg">${res.message}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-msg">エラー: ${err.message}</p>`;
    }
}

async function handleSearch(e, type) {
    e.preventDefault();
    const container = document.getElementById('dashboard-content');
    let keyword = '';
    let minPrice = '';
    let maxPrice = '';
    let message = '';

    if (type === 'keyword') {
        keyword = document.getElementById('search-keyword').value;
        minPrice = document.getElementById('search-min-price').value;
        maxPrice = document.getElementById('search-max-price').value;
        message = `「${keyword}」の検索結果`;
    } else {
        keyword = document.getElementById('search-url').value;
        message = 'URL検索結果';
    }

    const loadingMessage = (type === 'url')
        ? 'URLから商品情報を取得中...'
        : '商品を検索中...';

    container.innerHTML = `<div class="loading-spinner"></div><div style="text-align:center">${loadingMessage}</div>`;

    try {
        const res = await callApi('searchItems', { keyword, genreId: '', minPrice, maxPrice });
        if (res.success) {
            const data = {};
            data[message] = res.data;
            renderDashboard(data);
        } else {
            // エラーメッセージを改行コードも含めて表示
            container.innerHTML = `<p class="error-msg" style="white-space: pre-wrap;">${res.message}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-msg">エラー: ${err.message}</p>`;
    }
}

function extractUrlFromInput() {
    const input = document.getElementById('search-url');
    const text = input.value;
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
        input.value = urlMatch[0];
    }
}

function renderDashboard(data) {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    for (const [genre, items] of Object.entries(data)) {
        const section = document.createElement('div');
        section.innerHTML = `
            <h2 class="section-header">
                <i class="fas fa-tags"></i> ${genre}
                <span class="genre-badge">${items.length}件</span>
            </h2>
            <div class="grid" id="grid-${genre.replace(/\s+/g, '-')}"></div>
        `;
        container.appendChild(section);

        const grid = section.querySelector('.grid');
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => showItemModal(item);
            card.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.name}" class="card-img">
                <div class="card-body">
                    <div class="card-title">${item.name}</div>
                    <div class="card-price">¥${item.price.toLocaleString()}</div>
                </div>
            `;
            grid.appendChild(card);
        });
    }
}

function updatePremiumUI() {
    const isPremium = currentUser.plan === 'Premium';
    const toolbar = document.getElementById('premium-toolbar');
    const promo = document.getElementById('premium-promo');
    const homeRefresh = document.getElementById('home-refresh');

    if (isPremium) {
        toolbar.classList.remove('hidden');
        promo.classList.add('hidden');
        homeRefresh.classList.add('hidden');
    } else {
        toolbar.classList.add('hidden');
        promo.classList.remove('hidden');
        homeRefresh.classList.remove('hidden');
    }
}

function showItemModal(item) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');

    content.innerHTML = `
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <div class="modal-body">
            <div class="modal-image">
                <img src="${item.imageUrl}" alt="${item.name}">
            </div>
            <div class="modal-details">
                <h2 class="modal-title">${item.name}</h2>
                <div class="modal-price">¥${item.price.toLocaleString()}</div>
                <div class="modal-shop"><i class="fas fa-store"></i> ${item.shopName}</div>
                
                <div class="action-buttons">
                    <a href="${item.url}" target="_blank" class="btn btn-outline">
                        <i class="fas fa-external-link-alt"></i> 楽天市場で見る
                    </a>
                    <button class="btn" onclick="generatePost('${item.name.replace(/'/g, "\\'")}'))" id="gen-btn">
                        <i class="fas fa-magic"></i> 紹介文を生成
                    </button>
                </div>
                
                <div id="generated-content" class="generated-content hidden">
                    <h4>生成された紹介文</h4>
                    <textarea id="post-text" readonly></textarea>
                    <button class="btn copy-btn" onclick="copyText()">
                        <i class="fas fa-copy"></i> コピー
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

async function generatePost(itemName) {
    const btn = document.getElementById('gen-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

    try {
        const res = await callApi('generateRecommendation', {
            itemName: itemName,
            customPrompt: currentUser.customPrompt
        });

        if (res.success) {
            document.getElementById('generated-content').classList.remove('hidden');
            document.getElementById('post-text').value = res.data;
        } else {
            showToast(res.message);
        }
    } catch (err) {
        showToast('エラー: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-magic"></i> 再生成';
    }
}

function copyText() {
    const text = document.getElementById('post-text');
    text.select();
    document.execCommand('copy');
    showToast('コピーしました！');
}

// === 共通関数 ===

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

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function goToRandom() {
    if (currentUser) {
        if (currentUser.plan === 'Premium') {
            switchTab('random');
        } else {
            loadDashboardData();
        }
    }
}
