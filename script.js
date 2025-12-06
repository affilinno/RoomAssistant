// State
//let currentUser = null;
//let allGenres = [];
// GASのURLをハードコーディング
const API_URL = 'https://script.google.com/macros/s/AKfycbwHSyhOnCGg435H8kvdTT08sGzlr6XA3z3OhkMo7ri4kvwmkwSwJMrUAtdruhf3o5LG/exec';

// 状態管理
let currentUser = null;
let currentTab = 'random';

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    checkStripeCallback();
    initGoogleSignIn(); // Google認証の初期化
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

    // コンテンツの更新（hiddenクラスとactiveクラスを両方管理）
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');  // 非表示にする
    });
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) {
        targetContent.classList.remove('hidden');  // hidden削除
        targetContent.classList.add('active');      // active追加
    }

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
    modal.style.display = 'flex';

    content.innerHTML = `
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <div style="text-align:center">
            <img src="${item.imageUrl}" style="max-height:200px; border-radius:8px; margin-bottom:1rem;">
            <h3 style="font-size:1rem; margin:1rem 0;">${item.name}</h3>
        </div>
        <div class="loading-spinner"></div>
        <div style="text-align:center; color:#666; margin-top:1rem;">AI紹介文を生成中...</div>
    `;

    const customPrompt = currentUser.plan === 'Premium' ? (currentUser.customPrompt || '') : '';

    callApi('generateRecommendation', { itemName: item.name, customPrompt: customPrompt })
        .then(res => {
            if (!res.success) throw new Error(res.message || 'AI生成に失敗しました');
            const text = res.data;
            const roomUrl = `https://room.rakuten.co.jp/mix?itemcode=${encodeURIComponent(item.code)}&scid=we_room_upc60`;
            content.innerHTML = `
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div style="text-align:center; margin-bottom:1rem;">
                <img src="${item.imageUrl}" style="max-height:150px; border-radius:8px;">
                <h3 style="font-size:1rem; margin:0.5rem 0;">${item.name}</h3>
                <div style="color:var(--primary); font-weight:bold; font-size:1.1rem;">¥${item.price.toLocaleString()}</div>
            </div>
            <label style="font-weight:bold; font-size:0.9rem; display:block; margin-bottom:0.5rem;">
                <i class="fas fa-magic"></i> AI生成紹介文:
            </label>
            <div class="generated-text" id="copy-target">${text}</div>
            <div style="display:flex; gap:1rem; flex-direction:column; margin-top:1.5rem;">
                <button class="btn" onclick="copyAndOpen('${roomUrl.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> 紹介文をコピーしてROOMへ</button>
                <a href="${item.url}" target="_blank" class="btn" style="background:#666; text-align:center; text-decoration:none;"><i class="fas fa-external-link-alt"></i> 楽天市場で見る</a>
                <button class="btn" style="background:#ccc; color:#333;" onclick="closeModal()">閉じる</button>
            </div>
        `;
        }).catch(err => {
            console.error('AI生成エラー:', err);
            content.innerHTML = `<button class="modal-close" onclick="closeModal()">&times;</button><div style="color:red; text-align:center; margin:2rem 0;"><i class="fas fa-exclamation-circle"></i> エラー: ${err.message}</div><button class="btn" style="background:#666;" onclick="closeModal()">閉じる</button>`;
        });
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function copyAndOpen(url) {
    const textElement = document.getElementById('copy-target');
    if (!textElement) {
        showToast('コピー対象が見つかりません');
        return;
    }
    const text = textElement.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('✅ コピーしました！ROOMを開きます...');
        setTimeout(() => {
            window.open(url, '_blank');
            closeModal();
        }, 500);
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('⚠️ コピーに失敗しました。手動でコピーしてください。');
        setTimeout(() => { window.open(url, '_blank'); }, 1000);
    });
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

// ========================================
// Google認証（新規追加）
// ========================================

/**
 * Google Sign-Inを初期化
 */
async function initGoogleSignIn() {
    try {
        // Google Client IDを取得
        const res = await callApi('getGoogleClientId', {});

        if (!res.success || !res.clientId) {
            console.log('Google Client ID が設定されていません');
            return;
        }

        const clientId = res.clientId;

        // プレースホルダーの場合は初期化しない
        if (clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
            console.log('Google Client ID を設定してください');
            return;
        }

        // Google Sign-Inボタンを初期化
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleSignIn
        });

        // ボタンをレンダリング
        google.accounts.id.renderButton(
            document.getElementById('google-signin-button'),
            {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                width: 300,
                locale: 'ja'
            }
        );

        console.log('Google Sign-In 初期化完了');

    } catch (error) {
        console.error('Google Sign-In 初期化エラー:', error);
    }
}

/**
 * Googleログインのコールバック
 */
async function handleGoogleSignIn(response) {
    try {
        const idToken = response.credential;

        showToast('Googleアカウントで認証中...');

        // バックエンドにIDトークンを送信
        const res = await callApi('googleLogin', {
            idToken: idToken
        });

        if (res.success && res.user) {
            currentUser = res.user;
            localStorage.setItem('room_user', JSON.stringify(currentUser));

            showToast('✅ ログインしました！');
            showDashboard();
        } else {
            showToast('エラー: ' + (res.message || 'ログインに失敗しました'));
        }

    } catch (error) {
        console.error('Google Login エラー:', error);
        showToast('エラー: ' + error.message);
    }
}
