/**
 * ============================================================================
 * Hotel Luxury TV Template v2.0.1 - Master Controller (app.js)
 * ============================================================================
 * Architecture:
 * - Reactive UI: Alpine.js (Lightweight & Modular)
 * - Data Hierarchy: Dynamic recursive menu generator (menuData.js)
 * - Remote Engine: Universal Multi-Brand D-Pad & Spatial Navigation (Debounced)
 * - API & Bridge: Offline LocalStorage cache, Remote check-version & Flutter Native
 * ============================================================================
 */

'use strict';

/**
 * 1. UNIVERSAL TV REMOTE & KEYBOARD INPUT MANAGER
 * Normalizes keycodes across Android TV, Samsung Tizen, LG webOS, and PC Keyboards.
 */
const TVRemoteManager = {
    KEYMAP: {
        UP: [38, 19, 29460, 65362, 103],
        DOWN: [40, 20, 29461, 65364, 108],
        LEFT: [37, 21, 29462, 65361, 105],
        RIGHT: [39, 22, 29463, 65363, 106],
        ENTER: [13, 23, 66, 29443, 160, 108, 32],
        BACK: [8, 27, 4, 461, 10009, 10182, 220, 166, 65367],
        HOME: [36, 3, 172, 10071],
        MENU: [82, 18, 93, 448],
        EXIT: [10182, 27]
    },

    matches(e, action) {
        const code = e.keyCode || e.which;
        if (this.KEYMAP[action]?.includes(code)) return true;

        const k = (e.key || '').toLowerCase();
        const c = (e.code || '').toLowerCase();

        switch (action) {
            case 'UP': return k === 'arrowup' || k === 'up' || c === 'arrowup';
            case 'DOWN': return k === 'arrowdown' || k === 'down' || c === 'arrowdown';
            case 'LEFT': return k === 'arrowleft' || k === 'left' || c === 'arrowleft';
            case 'RIGHT': return k === 'arrowright' || k === 'right' || c === 'arrowright';
            case 'ENTER': return k === 'enter' || k === 'ok' || k === 'select' || k === ' ' || c === 'enter' || c === 'space';
            case 'BACK': return k === 'backspace' || k === 'escape' || k === 'back' || k === 'goback' || k === 'browserback' || c === 'escape' || c === 'backspace';
            case 'HOME': return k === 'home' || k === 'browserhome' || c === 'home';
            case 'EXIT': return k === 'exit' || code === 10182;
            default: return false;
        }
    },

    getDigit(e) {
        const code = e.keyCode || e.which;
        if (e.key === 'Tab' || e.key === 'Backspace' || e.key === 'Enter') return null;
        if (code >= 48 && code <= 57) return String(code - 48);
        if (code >= 96 && code <= 105) return String(code - 96);
        if (code >= 7 && code <= 16) return String(code - 7);
        if (e.key && /^\d$/.test(e.key)) return e.key;
        return null;
    },

    registerTizenPlatformKeys() {
        try {
            if (window.tizen?.tvinputdevice?.registerKey) {
                ['Return', 'Exit', 'Menu', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(k => {
                    try { window.tizen.tvinputdevice.registerKey(k); } catch (e) { }
                });
            }
        } catch (e) { }
    },

    lockCanvasGestures() {
        window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', 'Equal', 'Minus'].includes(e.key)) {
                e.preventDefault();
            }
        });
        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());
        document.addEventListener('gestureend', e => e.preventDefault());
    },

    navigateSpatial(direction) {
        const selector = 'button, [tabindex="0"], a, input, select, textarea, .tv-focusable';
        const focusables = Array.from(document.querySelectorAll(selector)).filter(el => {
            if (el.disabled || el.tabIndex === -1) return false;
            const s = window.getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });

        if (!focusables.length) return;

        const active = document.activeElement;
        if (!active || active === document.body || !focusables.includes(active)) {
            focusables[0].focus();
            return;
        }

        const activeRect = active.getBoundingClientRect();
        const activeCenter = { x: activeRect.left + activeRect.width / 2, y: activeRect.top + activeRect.height / 2 };

        let bestCandidate = null;
        let minDistance = Infinity;

        for (const candidate of focusables) {
            if (candidate === active) continue;
            const r = candidate.getBoundingClientRect();
            const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };

            let isValid = false;
            let dStraight = 0;
            let dOrthogonal = 0;

            switch (direction) {
                case 'left':
                    isValid = center.x < activeCenter.x;
                    dStraight = activeCenter.x - center.x;
                    dOrthogonal = Math.abs(activeCenter.y - center.y);
                    break;
                case 'right':
                    isValid = center.x > activeCenter.x;
                    dStraight = center.x - activeCenter.x;
                    dOrthogonal = Math.abs(activeCenter.y - center.y);
                    break;
                case 'up':
                    isValid = center.y < activeCenter.y;
                    dStraight = activeCenter.y - center.y;
                    dOrthogonal = Math.abs(activeCenter.x - center.x);
                    break;
                case 'down':
                    isValid = center.y > activeCenter.y;
                    dStraight = center.y - activeCenter.y;
                    dOrthogonal = Math.abs(activeCenter.x - center.x);
                    break;
            }

            if (isValid) {
                const dist = dStraight + (dOrthogonal * 3);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestCandidate = candidate;
                }
            }
        }

        if (bestCandidate) bestCandidate.focus();
    }
};

/**
 * 2. DATA SERVICE: SERVER CONFIG & CACHING (TVCore Bridge)
 */
const TVDataService = {
    async loadConfig(forceApi = false) {
        let config = null;
        let token = localStorage.getItem('authToken');

        // Check host frame
        if (window.tvLoginData?.data || window.tvLoginData) {
            config = window.tvLoginData.data || window.tvLoginData;
        } else if (window.parent?.tvLoginData) {
            config = window.parent.tvLoginData.data || window.parent.tvLoginData;
        }

        // Fetch local data.json
        if (!config) {
            try {
                const res = await fetch(`data.json?t=${Date.now()}`);
                if (res.ok) {
                    const raw = await res.json();
                    config = raw.data || raw;
                    if (config.auth?.token) {
                        token = config.auth.token;
                        localStorage.setItem('authToken', token);
                    }
                }
            } catch (e) {
                console.warn('[DataService] Local data fetch notice:', e);
            }
        }

        // Fetch remote API check-version if online
        if ((forceApi || !config) && navigator.onLine && token) {
            try {
                const apiRes = await fetch("https://tvapp.digiemperor.com/api/tv/template/check-version", {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    const fresh = apiData.data || apiData;
                    if (fresh?.hotel || fresh?.device) {
                        config = fresh;
                        if (!config.auth) config.auth = { token };
                        const fullPayload = { status: true, message: "TV data updated.", data: config };

                        // Sync with Flutter Native bridge
                        if (window.flutterBridge?.saveDeviceConfig) {
                            window.flutterBridge.saveDeviceConfig(fullPayload).catch(() => { });
                        }
                    }
                }
            } catch (apiErr) {
                console.warn('[DataService] Remote API fallback:', apiErr);
            }
        }

        // Local cache sync
        if (config) {
            localStorage.setItem('cachedHotelData', JSON.stringify(config));
        } else {
            try {
                const cached = localStorage.getItem('cachedHotelData');
                if (cached) config = JSON.parse(cached);
            } catch (err) { }
        }

        return config;
    }
};

/**
 * 3. MAIN ALPINE.JS APPLICATION COMPONENT
 */
function tvApp() {
    return {
        // --- REACTIVE STATE ---
        isLoaded: false,
        currentView: 'home',
        isMenuFlipping: false,
        viewHistory: [],
        menuStack: [], // Array of { list, index, title } for multi-level nested menus

        // Components HTML
        headerHtml: '',
        greetingHtml: '',
        menuSliderHtml: '',
        infoPanelHtml: '',
        languagesHtml: '',

        // Multilingual Translation Engine State (100% Offline Local JSON)
        currentLangTranslations: {},
        isRTL: false,

        // Languages State (21-Language Offline-Ready Array)
        selectedLangFile: localStorage.getItem('selectedLangFile') || 'english.json',
        activeLangFocusIndex: 0,
        justSelectedLang: false,
        availableLanguages: [
            { "name": "English", "file": "english.json", "code": "EN" },
            { "name": "हिंदी", "file": "hindi.json", "code": "HI" },
            { "name": "मराठी", "file": "marathi.json", "code": "MR" },
            { "name": "कोंकणी", "file": "konkani.json", "code": "GOM" },
            { "name": "ગુજરાતી", "file": "gujrati.json", "code": "GU" },
            { "name": "বাংলা", "file": "bengali.json", "code": "BN" },
            { "name": "ਪੰਜਾਬੀ", "file": "punjabi.json", "code": "PA" },
            { "name": "অসমীয়া", "file": "assamese.json", "code": "AS" },
            { "name": "ಕನ್ನಡ", "file": "kannada.json", "code": "KN" },
            { "name": "தமிழ்", "file": "tamil.json", "code": "TA" },
            { "name": "తెలుగు", "file": "telugu.json", "code": "TE" },
            { "name": "മലയാളം", "file": "malayalam.json", "code": "ML" },
            { "name": "Français", "file": "french.json", "code": "FR" },
            { "name": "Deutsch", "file": "german.json", "code": "DE" },
            { "name": "Español", "file": "spanish.json", "code": "ES" },
            { "name": "Português", "file": "portuguese.json", "code": "PT" },
            { "name": "Русский", "file": "russian.json", "code": "RU" },
            { "name": "简体中文", "file": "chinese.json", "code": "ZH" },
            { "name": "עִברִית", "file": "hebrew.json", "code": "HE" },
            { "name": "اردو", "file": "urdu.json", "code": "UR" },
            { "name": "عربي", "file": "arabic.json", "code": "AR" }
        ],

        // Info Panel State (Hotel Info, Room Info, Amenities)
        infoSlideIndex: 0,
        infoSlideTimer: null,

        // Hotel & Slider Data
        hotelData: {},
        sliderImages: [],
        activeSlideIndex: 0,
        slideIntervalMs: 7000,
        timerId: null,

        // Header & Greeting State
        timeStr: '',
        dateStr: '',
        roomNo: '',
        hotelLogo: '',
        weatherStr: 'Mumbai 28°C / 82°F',
        greetingStr: 'Good Afternoon, Guest',

        // Menu Carousel State
        activeMenuIndex: 0,
        currentMenuTitle: 'Main Menu',
        menuItems: [],
        currentMenuList: [],

        // Debounce & Rate Limiting
        lastNavTime: 0,
        lastActionTime: 0,
        navThrottleMs: 140,    // Smooth 140ms glide for arrow keys
        actionThrottleMs: 220, // 220ms debounce for Enter/Back/Home

        // --- LIFECYCLE INITIALIZER ---
        async init() {
            window.tvAppInstance = this;

            // 0. Load Selected Language (100% Offline Local JSON)
            await this.loadLanguage(this.selectedLangFile);

            // 1. Load Menus from internal menuData.js
            this.initMenuData();

            // 2. Lock Zoom & Register Tizen Keys
            TVRemoteManager.lockCanvasGestures();
            TVRemoteManager.registerTizenPlatformKeys();

            // 3. Live Clock & Greeting Timer
            this.updateClock();
            this.updateGreeting();
            this.updateWeatherStr();
            setInterval(() => {
                this.updateClock();
                this.updateGreeting();
            }, 1000);

            // 4. Ingest Modular Components
            await Promise.all([
                this.loadComponent('header', html => this.headerHtml = html),
                this.loadComponent('greeting', html => this.greetingHtml = html),
                this.loadComponent('menu_slider', html => this.menuSliderHtml = html),
                this.loadComponent('info_panel', html => this.infoPanelHtml = html),
                this.loadComponent('languages', html => this.languagesHtml = html)
            ]);

            // 5. Fetch Hotel Data
            const config = await TVDataService.loadConfig();
            if (config) this.applyHotelConfig(config);

            // 6. Start Background Slider
            this.startSlider();

            // 7. Reveal Viewport
            this.$nextTick(() => {
                setTimeout(() => { this.isLoaded = true; }, 100);
            });
        },

        // --- REUSABLE COMPONENT LOADER ---
        async loadComponent(name, setter) {
            try {
                const res = await fetch(`components/${name}.html?t=${Date.now()}`);
                if (res.ok) setter(await res.text());
            } catch (e) {
                console.warn(`[Component] Failed loading components/${name}.html:`, e);
            }
        },

        // --- CONFIG & GREETING HANDLERS ---
        applyHotelConfig(config) {
            this.hotelData = config;
            if (config.device?.room_no) this.roomNo = config.device.room_no;
            if (config.hotel?.media?.logo_image) this.hotelLogo = config.hotel.media.logo_image;
            if (Array.isArray(config.hotel?.media?.slider_images) && config.hotel.media.slider_images.length > 0) {
                this.sliderImages = config.hotel.media.slider_images;
                // Preload slider images asynchronously in background for smooth transitions
                this.sliderImages.forEach(src => {
                    if (src) {
                        const preloadImg = new Image();
                        preloadImg.decoding = 'async';
                        preloadImg.src = src;
                    }
                });
            }
            this.updateGreeting();
            this.updateWeatherStr();
        },

        // --- 100% OFFLINE TRANSLATION HELPERS ---
        t(key, fallback = '') {
            if (!key || !this.currentLangTranslations) return fallback || key;
            const parts = key.split('.');
            let curr = this.currentLangTranslations;
            for (const p of parts) {
                if (curr && typeof curr === 'object' && p in curr) {
                    curr = curr[p];
                } else {
                    return fallback || key;
                }
            }
            return (typeof curr === 'string' || typeof curr === 'number') ? String(curr) : (fallback || key);
        },

        async loadLanguage(file) {
            const langFile = file || this.selectedLangFile || 'english.json';
            const rtlFiles = ['arabic.json', 'urdu.json', 'hebrew.json'];
            this.isRTL = rtlFiles.includes(langFile);

            try {
                const res = await fetch(`languages/${langFile}?t=${Date.now()}`);
                if (res.ok) {
                    this.currentLangTranslations = await res.json();
                } else {
                    const fallbackRes = await fetch(`languages/english.json?t=${Date.now()}`);
                    if (fallbackRes.ok) this.currentLangTranslations = await fallbackRes.json();
                }
            } catch (err) {
                console.warn('[LanguageEngine] Error loading language file:', langFile, err);
            }

            // Apply HTML Direction & Language Tag
            const html = document.documentElement;
            if (html) {
                html.setAttribute('dir', this.isRTL ? 'rtl' : 'ltr');
                html.setAttribute('lang', this.currentLangTranslations.lang_code || (this.isRTL ? 'ar' : 'en'));
            }
            document.body.classList.toggle('rtl', this.isRTL);
            document.body.classList.toggle('ltr', !this.isRTL);

            // Re-render Dynamic Clocks & Greetings
            this.updateClock();
            this.updateGreeting();
            this.updateWeatherStr();
        },

        updateGreeting() {
            const h = new Date().getHours();
            const timeKey = (h >= 4 && h < 12) ? 'morning'
                : (h >= 12 && h < 17) ? 'afternoon'
                    : (h >= 17 && h < 22) ? 'evening'
                        : 'night';

            const defaultGreeting = (h >= 4 && h < 12) ? 'Good Morning'
                : (h >= 12 && h < 17) ? 'Good Afternoon'
                    : (h >= 17 && h < 22) ? 'Good Evening'
                        : 'Good Night';

            const timeGreeting = this.t(`greetings.${timeKey}`, defaultGreeting);

            let guestName = 'Guest';
            if (this.hotelData.guest_info) {
                guestName = (typeof this.hotelData.guest_info === 'string')
                    ? this.hotelData.guest_info.trim()
                    : (this.hotelData.guest_info.name || this.hotelData.guest_info.guest_name || 'Guest');
            }
            this.greetingStr = `${timeGreeting}, ${guestName}`;
        },

        updateClock() {
            const now = new Date();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            this.timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

            const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const defaultDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const defaultMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            const dKey = dayKeys[now.getDay()];
            const mKey = monthKeys[now.getMonth()];

            const dayStr = this.t(`days_short.${dKey}`, this.t(`days.${dKey}`, defaultDays[now.getDay()]));
            const monthStr = this.t(`months.${mKey}`, defaultMonths[now.getMonth()]);

            this.dateStr = `${dayStr}, ${monthStr} ${now.getDate()}`;
        },

        updateWeatherStr() {
            const city = this.hotelData.weather?.city || this.hotelData.hotel?.city || this.t('city_name', 'Mumbai');
            const temp = this.hotelData.weather?.temp_str || this.hotelData.weather?.temp || '28°C / 82°F';
            this.weatherStr = `${city} ${temp}`.trim();
        },

        // --- MENU GENERATOR (SCALABLE & RECURSIVE) ---
        initMenuData() {
            const raw = Array.isArray(window.MENU_DATA) ? window.MENU_DATA : [];
            this.menuItems = this.filterActiveMenus(raw);
            this.currentMenuList = this.menuItems;
            this.activeMenuIndex = 0;
            this.currentMenuTitle = 'Main Menu';
        },

        getMenuTitle(item) {
            if (!item) return '';
            const idKey = (item.id || '').toLowerCase().replace(/[\s-]+/g, '_');
            const nameKey = (item.name || '').toLowerCase().replace(/[\s-]+/g, '_');

            // Dynamic alias normalization for icon translation keys
            const key = idKey === 'apps' ? 'applications'
                : idKey === 'livetv' ? 'live_tv'
                : idKey === 'ourcity' ? 'our_city'
                : idKey;

            const trKey = this.t(`icons.${key}`, '');
            if (trKey && trKey !== `icons.${key}`) return trKey;

            const trName = this.t(`icons.${nameKey}`, '');
            if (trName && trName !== `icons.${nameKey}`) return trName;

            return item.name || '';
        },

        filterActiveMenus(items) {
            if (!Array.isArray(items)) return [];
            return items
                .filter(item => item && item.status !== 'hide')
                .map(item => {
                    const cloned = { ...item };
                    if (Array.isArray(cloned.sub_menus) && cloned.sub_menus.length > 0) {
                        cloned.sub_menus = this.filterActiveMenus(cloned.sub_menus);
                    }
                    return cloned;
                });
        },

        getMenuIcon(item) {
            if (!item) return '';
            if (item.icon && (item.icon.startsWith('http') || item.icon.startsWith('assets/') || item.icon.includes('/'))) {
                return item.icon;
            }
            if (item.icon) return `assets/images/icons/${item.icon}.png`;
            if (item.id) return `assets/images/icons/${item.id}.png`;
            return '';
        },

        // --- ADAPTIVE TV CAROUSEL MATH (1 TO 20+ ITEMS) ---
        getVisibleSlots() {
            const list = this.currentMenuList;
            if (!list || list.length === 0) return [];
            const len = list.length;

            let offsets = [];
            if (len === 1) offsets = [0];
            else if (len === 2) offsets = [0, 1];
            else if (len === 3) offsets = [-1, 0, 1];
            else if (len <= 5) offsets = [-2, -1, 0, 1, 2];
            else offsets = [-3, -2, -1, 0, 1, 2, 3];

            return offsets.map((offset, slotIdx) => {
                const normIndex = ((this.activeMenuIndex + offset) % len + len) % len;
                const item = list[normIndex];
                const dist = Math.abs(offset);
                const isCenter = (offset === 0);

                let scaleClass = 'scale-90 opacity-45 hover:opacity-75 z-0';
                if (isCenter) scaleClass = 'scale-110 opacity-100 z-20';
                else if (dist === 1) scaleClass = 'scale-100 opacity-80 hover:opacity-100 z-10';
                else if (dist === 2) scaleClass = 'scale-95 opacity-65 hover:opacity-90 z-5';

                return {
                    slotIdx,
                    offset,
                    dist,
                    isCenter,
                    index: normIndex,
                    item,
                    uniqueKey: `d${this.menuStack.length}-s${slotIdx}-off${offset}-id${item.id || normIndex}`,
                    scaleClass,
                    imgClass: isCenter
                        ? 'w-56 h-56 border-4 border-amber-400 shadow-[0_0_35px_rgba(255,215,0,0.9),0_0_15px_rgba(179,138,45,0.7)]'
                        : 'w-48 h-48 border-0',
                    textClass: isCenter
                        ? 'text-2xl font-black text-amber-400 drop-shadow-[0_0_14px_rgba(255,215,0,0.9)]'
                        : 'text-xl font-bold text-slate-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]'
                };
            });
        },

        slideMenu(dir) {
            const len = this.currentMenuList.length;
            if (len <= 0) return;
            this.activeMenuIndex = ((this.activeMenuIndex + dir) % len + len) % len;
        },

        onSlotClick(slot) {
            if (!slot) return;
            if (slot.isCenter) this.selectMenuItem(slot.item);
            else this.slideMenu(slot.offset);
        },

        // --- NAVIGATION & SUB-MENU CONTROLLER ---
        selectMenuItem(item) {
            if (!item) return;

            if (Array.isArray(item.sub_menus) && item.sub_menus.length > 0) {
                this.isMenuFlipping = true;
                setTimeout(() => {
                    this.menuStack.push({
                        list: this.currentMenuList,
                        index: this.activeMenuIndex,
                        title: this.currentMenuTitle
                    });
                    this.currentMenuList = item.sub_menus;
                    this.activeMenuIndex = 0;
                    this.currentMenuTitle = item.name;
                    setTimeout(() => { this.isMenuFlipping = false; }, 150);
                }, 200);
                return;
            }

            this.navigate(item.id);
        },

        navigate(viewId) {
            if (this.currentView !== viewId) {
                this.viewHistory.push(this.currentView);
                this.currentView = viewId;
                if (['hotel_info', 'room_info', 'amenities'].includes(viewId)) {
                    this.infoSlideIndex = 0;
                    this.resetInfoScroll();
                    this.startInfoAutoSlide();
                } else if (['language', 'languages'].includes(viewId)) {
                    const foundIdx = this.availableLanguages.findIndex(l => l.file === this.selectedLangFile);
                    this.activeLangFocusIndex = foundIdx >= 0 ? foundIdx : 0;
                    this.focusCurrentLanguage();
                }
            }
        },

        // --- LANGUAGES CONTROLLER ---
        selectLanguage(file, idx) {
            this.selectedLangFile = file;
            this.justSelectedLang = true;
            if (typeof idx === 'number') {
                this.activeLangFocusIndex = idx;
                this.focusCurrentLanguage();
            }
        },

        async applyLanguage() {
            localStorage.setItem('selectedLangFile', this.selectedLangFile);
            await this.loadLanguage(this.selectedLangFile);
            if (window.flutterBridge && typeof window.flutterBridge.setLanguage === 'function') {
                window.flutterBridge.setLanguage(this.selectedLangFile).catch(() => {});
            }
            if (window.AndroidBridge && typeof window.AndroidBridge.setLanguage === 'function') {
                window.AndroidBridge.setLanguage(this.selectedLangFile);
            }
            this.goBack();
        },

        focusCurrentLanguage() {
            this.$nextTick(() => {
                if (typeof this.activeLangFocusIndex === 'number') {
                    const el = document.getElementById(`lang_item_${this.activeLangFocusIndex}`);
                    if (el) {
                        el.focus();
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                } else if (this.activeLangFocusIndex === 'apply') {
                    document.getElementById('lang-btn-apply')?.focus();
                } else if (this.activeLangFocusIndex === 'cancel') {
                    document.getElementById('lang-btn-cancel')?.focus();
                }
            });
        },

        goBack() {
            this.stopInfoAutoSlide();
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            if (this.currentView !== 'home') {
                this.currentView = this.viewHistory.pop() || 'home';
                return;
            }

            if (this.menuStack.length > 0) {
                this.isMenuFlipping = true;
                setTimeout(() => {
                    const prev = this.menuStack.pop();
                    this.currentMenuList = prev.list;
                    this.activeMenuIndex = prev.index;
                    this.currentMenuTitle = prev.title;
                    setTimeout(() => { this.isMenuFlipping = false; }, 150);
                }, 200);
            }
        },

        // --- SHARED INFO PANEL CONTROLLER (HOTEL INFO, ROOM INFO, AMENITIES) ---
        getInfoPanelTitle() {
            if (this.currentView === 'hotel_info') return this.t('icons.hotel_info', 'HOTEL INFORMATION').toUpperCase();
            if (this.currentView === 'room_info') return this.t('icons.rooms', 'ROOM INFORMATION').toUpperCase();
            if (this.currentView === 'amenities') return this.t('icons.amenities', 'AMENITIES').toUpperCase();
            return this.t('hotel_info', 'INFORMATION').toUpperCase();
        },

        getInfoList() {
            if (this.currentView === 'hotel_info') {
                const list = Array.isArray(this.hotelData.hotel_info) ? this.hotelData.hotel_info : [];
                if (list.length > 0) {
                    return list.map(item => ({
                        title: item.title || '',
                        description: item.description || '',
                        image: item.image_url || item.url || item.image || '',
                        features: Array.isArray(item.features) ? item.features : []
                    }));
                }

                // Fallback to hotel.media.hotel_images or cover_image if hotel_info is in media
                const h = this.hotelData.hotel || {};
                const media = h.media || {};
                let images = (Array.isArray(media.hotel_images) && media.hotel_images.length > 0)
                    ? media.hotel_images
                    : (Array.isArray(media.slider_images) && media.slider_images.length > 0)
                        ? media.slider_images
                        : (media.cover_image ? [media.cover_image] : []);

                return images.map(img => {
                    if (typeof img === 'object' && img !== null) {
                        return {
                            title: img.title || h.hotel_name || '',
                            description: img.description || h.description || '',
                            image: img.image_url || img.url || '',
                            features: Array.isArray(img.features) ? img.features : []
                        };
                    }
                    return {
                        title: h.hotel_name || '',
                        description: h.description || '',
                        image: img || '',
                        features: []
                    };
                });
            }

            if (this.currentView === 'room_info') {
                const list = Array.isArray(this.hotelData.room_info) ? this.hotelData.room_info : [];
                if (list.length > 0) {
                    return list.map(item => ({
                        title: item.title || '',
                        description: item.description || '',
                        image: item.image_url || item.url || item.image || '',
                        specifications: Array.isArray(item.specifications) ? item.specifications : []
                    }));
                }
                return [];
            }

            if (this.currentView === 'amenities') {
                const list = Array.isArray(this.hotelData.amenities) ? this.hotelData.amenities : [];
                if (list.length > 0) {
                    return list.map(item => ({
                        title: item.title || '',
                        description: item.description || '',
                        image: item.image_url || item.url || item.image || ''
                    }));
                }
                return [];
            }

            return [];
        },

        getInfoImages() {
            const list = this.getInfoList();
            return list.map(item => item.image);
        },

        getCurrentInfoItem() {
            const list = this.getInfoList();
            if (!list || list.length === 0) {
                return { title: '', description: '', features: [], specifications: [] };
            }
            const idx = Math.min(this.infoSlideIndex, list.length - 1);
            return list[idx] || list[0];
        },

        changeInfoSlide(dir) {
            const total = this.getInfoImages().length;
            if (total <= 1) return;
            this.infoSlideIndex = (this.infoSlideIndex + dir + total) % total;
            this.resetInfoScroll();
            this.startInfoAutoSlide();
        },

        resetInfoScroll() {
            this.$nextTick(() => {
                const el = document.getElementById('info-description-scroll');
                if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
            });
        },

        scrollInfoPanel(delta) {
            const el = document.getElementById('info-description-scroll');
            if (el) {
                el.scrollBy({ top: delta, behavior: 'smooth' });
            }
        },

        startInfoAutoSlide() {
            this.stopInfoAutoSlide();
            this.infoSlideTimer = setInterval(() => {
                const total = this.getInfoImages().length;
                if (total > 1) {
                    this.infoSlideIndex = (this.infoSlideIndex + 1) % total;
                    this.resetInfoScroll();
                }
            }, 6000);
        },

        stopInfoAutoSlide() {
            if (this.infoSlideTimer) {
                clearInterval(this.infoSlideTimer);
                this.infoSlideTimer = null;
            }
        },

        // --- CENTRAL REMOTE & KEYBOARD LISTENER ---
        handleGlobalKeys(e) {
            const now = Date.now();
            const isDirection = TVRemoteManager.matches(e, 'LEFT') || TVRemoteManager.matches(e, 'RIGHT') || TVRemoteManager.matches(e, 'UP') || TVRemoteManager.matches(e, 'DOWN');
            const isAction = TVRemoteManager.matches(e, 'ENTER') || TVRemoteManager.matches(e, 'BACK') || TVRemoteManager.matches(e, 'HOME') || TVRemoteManager.matches(e, 'EXIT');

            // 1. Navigation Throttle
            if (isDirection) {
                if (now - this.lastNavTime < this.navThrottleMs) { e.preventDefault(); return; }
                this.lastNavTime = now;
            }

            // 2. Action Debounce
            if (isAction) {
                if (now - this.lastActionTime < this.actionThrottleMs) { e.preventDefault(); return; }
                this.lastActionTime = now;
            }

            // Back Action
            if (TVRemoteManager.matches(e, 'BACK')) {
                e.preventDefault();
                this.goBack();
                return;
            }

            // Home Action (Resets to root Home)
            if (TVRemoteManager.matches(e, 'HOME')) {
                e.preventDefault();
                this.stopInfoAutoSlide();
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                this.currentView = 'home';
                this.menuStack = [];
                this.currentMenuList = this.menuItems;
                this.activeMenuIndex = 0;
                return;
            }

            // --- 2D GRID NAVIGATION FOR LANGUAGES SCREEN ---
            if (['language', 'languages'].includes(this.currentView)) {
                const total = this.availableLanguages.length;
                const cols = 3;

                // LEFT
                if (TVRemoteManager.matches(e, 'LEFT')) {
                    e.preventDefault();
                    this.justSelectedLang = false;
                    if (typeof this.activeLangFocusIndex === 'number') {
                        const col = this.activeLangFocusIndex % cols;
                        if (col > 0) {
                            this.activeLangFocusIndex -= 1;
                            this.focusCurrentLanguage();
                        }
                    } else if (this.activeLangFocusIndex === 'cancel') {
                        this.activeLangFocusIndex = 'apply';
                        this.focusCurrentLanguage();
                    }
                    return;
                }

                // RIGHT
                if (TVRemoteManager.matches(e, 'RIGHT')) {
                    e.preventDefault();
                    this.justSelectedLang = false;
                    if (typeof this.activeLangFocusIndex === 'number') {
                        const col = this.activeLangFocusIndex % cols;
                        if (col < cols - 1 && this.activeLangFocusIndex + 1 < total) {
                            this.activeLangFocusIndex += 1;
                            this.focusCurrentLanguage();
                        }
                    } else if (this.activeLangFocusIndex === 'apply') {
                        this.activeLangFocusIndex = 'cancel';
                        this.focusCurrentLanguage();
                    }
                    return;
                }

                // UP
                if (TVRemoteManager.matches(e, 'UP')) {
                    e.preventDefault();
                    this.justSelectedLang = false;
                    if (typeof this.activeLangFocusIndex === 'number') {
                        const row = Math.floor(this.activeLangFocusIndex / cols);
                        if (row > 0) {
                            this.activeLangFocusIndex -= cols;
                            this.focusCurrentLanguage();
                        } else {
                            document.getElementById('tv-header-back-btn')?.focus();
                        }
                    } else if (this.activeLangFocusIndex === 'apply' || this.activeLangFocusIndex === 'cancel') {
                        const selIdx = this.availableLanguages.findIndex(l => l.file === this.selectedLangFile);
                        this.activeLangFocusIndex = selIdx >= 0 ? selIdx : (total - 1);
                        this.focusCurrentLanguage();
                    }
                    return;
                }

                // DOWN
                if (TVRemoteManager.matches(e, 'DOWN')) {
                    e.preventDefault();
                    if (document.activeElement === document.getElementById('tv-header-back-btn')) {
                        document.getElementById('tv-header-back-btn')?.blur();
                        this.activeLangFocusIndex = 0;
                        this.focusCurrentLanguage();
                        return;
                    }

                    // Direct jump to Apply & Continue if just selected or at bottom row
                    if (this.justSelectedLang) {
                        this.justSelectedLang = false;
                        this.activeLangFocusIndex = 'apply';
                        this.focusCurrentLanguage();
                        return;
                    }

                    if (typeof this.activeLangFocusIndex === 'number') {
                        if (this.activeLangFocusIndex + cols < total) {
                            this.activeLangFocusIndex += cols;
                            this.focusCurrentLanguage();
                        } else {
                            this.activeLangFocusIndex = 'apply';
                            this.focusCurrentLanguage();
                        }
                    }
                    return;
                }

                // ENTER / OK
                if (TVRemoteManager.matches(e, 'ENTER')) {
                    e.preventDefault();
                    if (typeof this.activeLangFocusIndex === 'number') {
                        this.selectedLangFile = this.availableLanguages[this.activeLangFocusIndex].file;
                        this.justSelectedLang = true;
                    } else if (this.activeLangFocusIndex === 'apply') {
                        this.applyLanguage();
                    } else if (this.activeLangFocusIndex === 'cancel') {
                        this.goBack();
                    } else {
                        const el = document.activeElement;
                        if (el && typeof el.click === 'function') el.click();
                    }
                    return;
                }
            }

            // Left / Right Navigation (Slide Prev / Next)
            if (TVRemoteManager.matches(e, 'LEFT')) {
                e.preventDefault();
                if (this.currentView === 'home') this.slideMenu(-1);
                else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) this.changeInfoSlide(-1);
                else TVRemoteManager.navigateSpatial('left');
                return;
            }
            if (TVRemoteManager.matches(e, 'RIGHT')) {
                e.preventDefault();
                if (this.currentView === 'home') this.slideMenu(1);
                else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) this.changeInfoSlide(1);
                else TVRemoteManager.navigateSpatial('right');
                return;
            }

            // Up / Down Navigation
            if (TVRemoteManager.matches(e, 'UP')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    const cur = this.currentMenuList[this.activeMenuIndex];
                    if (cur) this.selectMenuItem(cur);
                } else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) {
                    const el = document.getElementById('info-description-scroll');
                    const backBtn = document.getElementById('tv-header-back-btn');
                    if (el && el.scrollTop > 20) {
                        this.scrollInfoPanel(-150);
                    } else if (backBtn) {
                        backBtn.focus();
                    }
                } else {
                    TVRemoteManager.navigateSpatial('up');
                }
                return;
            }
            if (TVRemoteManager.matches(e, 'DOWN')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    if (this.menuStack.length > 0) {
                        this.goBack();
                    }
                } else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) {
                    const backBtn = document.getElementById('tv-header-back-btn');
                    if (document.activeElement === backBtn) {
                        backBtn.blur();
                    }
                    this.scrollInfoPanel(150);
                } else {
                    TVRemoteManager.navigateSpatial('down');
                }
                return;
            }

            // Enter / OK Action
            if (TVRemoteManager.matches(e, 'ENTER')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    const cur = this.currentMenuList[this.activeMenuIndex];
                    if (cur) this.selectMenuItem(cur);
                } else {
                    const el = document.activeElement;
                    if (el && el !== document.body && typeof el.click === 'function') {
                        el.click();
                    }
                }
                return;
            }

            // Number Keys
            const digit = TVRemoteManager.getDigit(e);
            if (digit !== null && typeof window.onTVNumericInput === 'function') {
                window.onTVNumericInput(digit);
            }
        },

        // --- BACKGROUND SLIDESHOW ---
        startSlider() {
            if (this.timerId) clearInterval(this.timerId);
            if (this.sliderImages.length > 1) {
                this.timerId = setInterval(() => {
                    this.activeSlideIndex = (this.activeSlideIndex + 1) % this.sliderImages.length;
                }, this.slideIntervalMs);
            }
        }
    };
}

// Global Native Flutter Bridge Hooks
window.triggerTVBack = () => window.tvAppInstance?.goBack?.();
window.triggerTVHome = () => {
    if (window.tvAppInstance) {
        window.tvAppInstance.currentView = 'home';
        window.tvAppInstance.menuStack = [];
        window.tvAppInstance.currentMenuList = window.tvAppInstance.menuItems;
        window.tvAppInstance.activeMenuIndex = 0;
    }
};
