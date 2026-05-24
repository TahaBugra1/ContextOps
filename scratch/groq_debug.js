/**
 * Groq Console Automation Debugger (NATIVE KEYSTROKE EDITION)
 * 
 * Instructions:
 * 1. Go to https://console.groq.com/keys
 * 2. Press F12 -> Console
 * 3. Paste and Enter.
 */

(async () => {
    console.clear();
    console.group('%c🚀 [Groq-Debug] Native Keystroke Mode Active', 'color: #7c3aed; font-weight: bold; font-size: 14px;');
    
    const getAllElements = (root) => {
        let results = Array.from(root.querySelectorAll('*'));
        results.forEach(el => {
            if (el.shadowRoot) results.push(...getAllElements(el.shadowRoot));
        });
        return results;
    };

    const waitForElement = (texter, name) => {
        console.log(`%c[Adım] Bekleniyor: ${name}...`, 'color: #3b82f6;');
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const all = getAllElements(document);
                const el = all.find(texter);
                if (el) {
                    console.log(`%c[Bulundu] ${name} algılandı!`, 'color: #10b981;');
                    clearInterval(interval);
                    resolve(el);
                }
            }, 800);
        });
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Ana Buton
    const trigger = await waitForElement(el => {
        if (el.tagName !== 'BUTTON' && el.tagName !== 'SPAN') return false;
        const t = el.innerText?.toLowerCase() || '';
        return t.includes('create api key') && el.getBoundingClientRect().top < 400;
    }, 'Create API Key Butonu');

    trigger.click();
    
    // 2. BEKLEME: Önce Submit butonu (Captcha onayı) gelmeli
    console.log('%c[Pusu] Captcha onaylanıp Submit butonu belirene kadar beklenecek...', 'color: #3b82f6; font-weight: bold;');
    
    const submitBtn = await waitForElement(el => {
        const tid = el.getAttribute('data-testid');
        const text = el.innerText?.trim() || '';
        return tid === 'key-form-submit-button' || (el.tagName === 'BUTTON' && text === 'Submit');
    }, 'Submit Butonu');

    // 3. ŞİMDİ İSMİ GİR (NATIVE KEYSTROKE)
    console.log('[Aksiyon] Buton hazır! Arayüzün oturması için biraz bekleniyor (800ms)...');
    await sleep(800);

    const inputFound = getAllElements(document).find(el => {
        return el.tagName === 'INPUT' && (el.placeholder?.includes('API Key') || el.id?.includes('name') || el.name?.includes('name'));
    });

    if (inputFound) {
        // İnsansı klavye simülasyonu
        inputFound.focus();
        inputFound.select();
        
        const keyName = 'Turbo-Key-' + Math.floor(Math.random() * 1000);
        const success = document.execCommand('insertText', false, keyName);
        
        if (!success) {
            console.warn('execCommand failed, using fallback.');
            inputFound.value = keyName;
            inputFound.dispatchEvent(new Event('input', { bubbles: true }));
            inputFound.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        console.log(`İsim yazıldı (${keyName}). Verinin sisteme işlemesi için 800ms daha bekleniyor...`);
        await sleep(800);
        
        // Tıkla
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            submitBtn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
        if (submitBtn.click) submitBtn.click();
        console.log('%cİŞLEM TAMAM.', 'color: #10b981; font-weight: bold;');
    } else {
        console.error('Hata: İsim giriş alanı bulunamadı!');
    }

    console.groupEnd();
})();
