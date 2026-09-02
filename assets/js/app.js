/**
 * Hotel Luxury TV Template v2.0.1 - Main Application Controller (app.js)
 * Clean Architecture using Repository Pattern:
 * - Native Bridge: bridge.js (window.flutterBridge, window.AndroidBridge)
 * - Remote Navigation: remote.js (TVRemoteManager)
 * - Data & Bridge: dataService.js (TVDataService)
 * - Languages Data: languagesData.js (AVAILABLE_LANGUAGES)
 * - Menu Hierarchy: menuData.js (MENU_DATA)
 * - Applications Controller: applications.js (TVAppsController)
 * - Screen Cast Controller: screenCast.js (TVScreenCastController)
 * - Weather Controller: weather.js (TVWeatherController)
 */
'use strict';

function tvApp() {
    return {
        // --- REACTIVE STATE ---
        isLoaded: false,
        currentView: 'home',
        isMenuFlipping: false,
        viewHistory: [],
        menuStack: [],

        // Ingested Component Templates
        headerHtml: '',
        greetingHtml: '',
        menuSliderHtml: '',
        infoPanelHtml: '',
        languagesHtml: '',
        applicationsHtml: '',
        screenCastHtml: '',
        weatherHtml: '',

        // 100% Offline Multilingual Engine
        currentLangTranslations: {},
        isRTL: false,
        selectedLangFile: localStorage.getItem('selectedLangFile') || 'english.json',
        activeLangFocusIndex: 0,
        justSelectedLang: false,
        availableLanguages: window.AVAILABLE_LANGUAGES || [],

        // Shared Info Panel State
        infoSlideIndex: 0,
        infoSlideTimer: null,

        // Applications & OTT Apps Controller Module
        ...(window.TVAppsController || {}),

        // Screen Cast Controller Module
        ...(window.TVScreenCastController || {}),

        // Weather Controller Module
        ...(window.TVWeatherController || {}),

        // Hotel & Slideshow State
        hotelData: {},
        sliderImages: [],
        activeSlideIndex: 0,
        slideIntervalMs: 7000,
        timerId: null,

        // Header & Live Status
        timeStr: '',
        dateStr: '',
        roomNo: '',
        hotelLogo: '',
        weatherStr: '',
        toastMessage: '',
        toastTimer: null,
        greetingStr: 'Good Afternoon, Guest',

        // Adaptive Menu Carousel
        activeMenuIndex: 0,
        currentMenuTitle: 'Main Menu',
        menuItems: [],
        currentMenuList: [],

        // D-Pad Throttling & Debounce
        lastNavTime: 0,
        lastActionTime: 0,
        navThrottleMs: 140,
        actionThrottleMs: 220,

        // --- LIFECYCLE INITIALIZER ---
        async init() {
            window.tvAppInstance = this;

            await this.loadLanguage(this.selectedLangFile);
            this.initMenuData();

            TVRemoteManager.lockCanvasGestures();
            TVRemoteManager.registerTizenPlatformKeys();

            this.updateClock();
            this.updateGreeting();
            this.updateWeatherStr();
            if (typeof this.initWeatherBackgroundSync === 'function') {
                this.initWeatherBackgroundSync();
            }
            setInterval(() => {
                this.updateClock();
                this.updateGreeting();
            }, 1000);

            await Promise.all([
                this.loadComponent('header', html => this.headerHtml = html),
                this.loadComponent('greeting', html => this.greetingHtml = html),
                this.loadComponent('menu_slider', html => this.menuSliderHtml = html),
                this.loadComponent('info_panel', html => this.infoPanelHtml = html),
                this.loadComponent('languages', html => this.languagesHtml = html),
                this.loadComponent('applications', html => this.applicationsHtml = html),
                this.loadComponent('screen_cast', html => this.screenCastHtml = html),
                this.loadComponent('weather', html => this.weatherHtml = html)
            ]);

            const config = await TVDataService.loadConfig();
            if (config) this.applyHotelConfig(config);

            this.startSlider();
            this.$nextTick(() => setTimeout(() => { this.isLoaded = true; }, 100));
        },

        async loadComponent(name, setter) {
            try {
                const res = await fetch(`components/${name}.html?t=${Date.now()}`);
                if (res.ok) setter(await res.text());
            } catch (e) {
                console.warn(`[Component] Failed loading components/${name}.html:`, e);
            }
        },

        // --- CONFIG & BRANDING ---
        applyHotelConfig(config) {
            this.hotelData = config;
            if (config.device?.room_no) this.roomNo = config.device.room_no;
            if (config.hotel?.media?.logo_image) this.hotelLogo = config.hotel.media.logo_image;
            if (Array.isArray(config.active_ott) && config.active_ott.length > 0) {
                this.activeOttList = config.active_ott;
            }
            if (Array.isArray(config.hotel?.media?.slider_images) && config.hotel.media.slider_images.length > 0) {
                this.sliderImages = config.hotel.media.slider_images;
                this.sliderImages.forEach(src => {
                    if (src) {
                        const img = new Image();
                        img.decoding = 'async';
                        img.src = src;
                    }
                });
            }
            this.updateGreeting();
            this.updateWeatherStr();
            if (typeof this.initWeatherBackgroundSync === 'function') {
                this.initWeatherBackgroundSync();
            }
        },

        // --- 100% OFFLINE TRANSLATION ENGINE ---
        t(key, fallback = '') {
            if (!key || !this.currentLangTranslations) return fallback || key;
            let curr = this.currentLangTranslations;
            for (const p of key.split('.')) {
                if (curr && typeof curr === 'object' && p in curr) curr = curr[p];
                else return fallback || key;
            }
            return (typeof curr === 'string' || typeof curr === 'number') ? String(curr) : (fallback || key);
        },

        async loadLanguage(file) {
            const langFile = file || this.selectedLangFile || 'english.json';
            const rtlFiles = window.RTL_LANG_FILES || ['arabic.json', 'urdu.json', 'hebrew.json'];
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
                console.warn('[LanguageEngine] Error loading language:', langFile, err);
            }

            const html = document.documentElement;
            if (html) {
                html.setAttribute('dir', this.isRTL ? 'rtl' : 'ltr');
                html.setAttribute('lang', this.currentLangTranslations.lang_code || (this.isRTL ? 'ar' : 'en'));
            }
            document.body.classList.toggle('rtl', this.isRTL);
            document.body.classList.toggle('ltr', !this.isRTL);

            this.updateClock();
            this.updateGreeting();
            this.updateWeatherStr();
        },

        updateGreeting() {
            const h = new Date().getHours();
            const timeKey = (h >= 4 && h < 12) ? 'morning' : (h >= 12 && h < 17) ? 'afternoon' : (h >= 17 && h < 22) ? 'evening' : 'night';
            const defaultGreeting = (h >= 4 && h < 12) ? 'Good Morning' : (h >= 12 && h < 17) ? 'Good Afternoon' : (h >= 17 && h < 22) ? 'Good Evening' : 'Good Night';
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
            if (typeof this.updateWeatherHeaderStr === 'function') {
                this.updateWeatherHeaderStr();
            } else {
                this.weatherStr = '';
            }
        },

        showToast(msg) {
            this.toastMessage = msg;
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                this.toastMessage = '';
            }, 3000);
        },

        // --- MENU CONTROLLER ---
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
            const key = idKey === 'apps' ? 'applications' : idKey === 'livetv' ? 'live_tv' : idKey === 'ourcity' ? 'our_city' : idKey;

            const trKey = this.t(`icons.${key}`, '');
            if (trKey && trKey !== `icons.${key}`) return trKey;

            const trName = this.t(`icons.${nameKey}`, '');
            if (trName && trName !== `icons.${nameKey}`) return trName;

            return item.name || '';
        },

        filterActiveMenus(items) {
            if (!Array.isArray(items)) return [];
            return items.filter(item => item && item.status !== 'hide').map(item => {
                const cloned = { ...item };
                if (Array.isArray(cloned.sub_menus) && cloned.sub_menus.length > 0) {
                    cloned.sub_menus = this.filterActiveMenus(cloned.sub_menus);
                }
                return cloned;
            });
        },

        getMenuIcon(item) {
            if (!item) return '';
            if (item.icon && (item.icon.startsWith('http') || item.icon.startsWith('assets/') || item.icon.includes('/'))) return item.icon;
            if (item.icon) return `assets/images/icons/${item.icon}.png`;
            if (item.id) return `assets/images/icons/${item.id}.png`;
            return '';
        },

        // --- ADAPTIVE TV CAROUSEL MATH ---
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
                    slotIdx, offset, dist, isCenter, index: normIndex, item,
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
            if (len > 0) this.activeMenuIndex = ((this.activeMenuIndex + dir) % len + len) % len;
        },

        onSlotClick(slot) {
            if (!slot) return;
            if (slot.isCenter) this.selectMenuItem(slot.item);
            else this.slideMenu(slot.offset);
        },

        selectMenuItem(item) {
            if (!item) return;
            if (Array.isArray(item.sub_menus) && item.sub_menus.length > 0) {
                this.isMenuFlipping = true;
                setTimeout(() => {
                    this.menuStack.push({ list: this.currentMenuList, index: this.activeMenuIndex, title: this.currentMenuTitle });
                    this.currentMenuList = item.sub_menus;
                    this.activeMenuIndex = 0;
                    this.currentMenuTitle = item.name;
                    setTimeout(() => { this.isMenuFlipping = false; }, 150);
                }, 200);
                return;
            }

            if (item.id === 'weather' && !navigator.onLine) {
                this.showToast('No Internet Connection. Please connect to internet.');
                return;
            }

            this.navigate(item.id);
        },

        navigate(viewId) {
            if (viewId === 'weather' && !navigator.onLine) {
                this.showToast('No Internet Connection. Please connect to internet.');
                return;
            }

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
                } else if (['apps', 'applications'].includes(viewId)) {
                    this.activeAppFocusIndex = 0;
                    this.focusCurrentApp();
                } else if (['screen_cast', 'cast'].includes(viewId)) {
                    this.openScreenCast();
                } else if (viewId === 'weather') {
                    this.openWeather();
                }
            }
        },

        // --- LANGUAGES MODAL CONTROLLER ---
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
            if (window.flutterBridge?.setLanguage) window.flutterBridge.setLanguage(this.selectedLangFile).catch(() => {});
            if (window.AndroidBridge?.setLanguage) window.AndroidBridge.setLanguage(this.selectedLangFile);
            this.goBack();
        },

        focusCurrentLanguage() {
            this.$nextTick(() => {
                if (typeof this.activeLangFocusIndex === 'number') {
                    const el = document.getElementById(`lang_item_${this.activeLangFocusIndex}`);
                    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                } else if (this.activeLangFocusIndex === 'apply') {
                    document.getElementById('lang-btn-apply')?.focus();
                } else if (this.activeLangFocusIndex === 'cancel') {
                    document.getElementById('lang-btn-cancel')?.focus();
                }
            });
        },

        goBack() {
            this.stopInfoAutoSlide();
            if (document.activeElement?.blur) document.activeElement.blur();
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

        // --- INFO PANEL CONTROLLER ---
        getInfoPanelTitle() {
            if (this.currentView === 'hotel_info') return this.t('icons.hotel_info', 'HOTEL INFORMATION').toUpperCase();
            if (this.currentView === 'room_info') return this.t('icons.room_info', 'ROOM INFORMATION').toUpperCase();
            if (this.currentView === 'amenities') return this.t('icons.amenities', 'AMENITIES').toUpperCase();
            return this.t('hotel_info', 'INFORMATION').toUpperCase();
        },

        getInfoList() {
            if (this.currentView === 'hotel_info') {
                const list = Array.isArray(this.hotelData.hotel_info) ? this.hotelData.hotel_info : [];
                if (list.length > 0) {
                    return list.map(item => ({
                        title: item.title || '', description: item.description || '',
                        image: item.image_url || item.url || item.image || '', features: Array.isArray(item.features) ? item.features : []
                    }));
                }
                const h = this.hotelData.hotel || {};
                const media = h.media || {};
                const images = (Array.isArray(media.hotel_images) && media.hotel_images.length > 0)
                    ? media.hotel_images : (Array.isArray(media.slider_images) && media.slider_images.length > 0)
                        ? media.slider_images : (media.cover_image ? [media.cover_image] : []);

                return images.map(img => (typeof img === 'object' && img !== null)
                    ? { title: img.title || h.hotel_name || '', description: img.description || h.description || '', image: img.image_url || img.url || '', features: Array.isArray(img.features) ? img.features : [] }
                    : { title: h.hotel_name || '', description: h.description || '', image: img || '', features: [] }
                );
            }
            if (this.currentView === 'room_info') {
                const list = Array.isArray(this.hotelData.room_info) ? this.hotelData.room_info : [];
                return list.map(item => ({
                    title: item.title || '', description: item.description || '',
                    image: item.image_url || item.url || item.image || '', specifications: Array.isArray(item.specifications) ? item.specifications : []
                }));
            }
            if (this.currentView === 'amenities') {
                const list = Array.isArray(this.hotelData.amenities) ? this.hotelData.amenities : [];
                return list.map(item => ({ title: item.title || '', description: item.description || '', image: item.image_url || item.url || item.image || '' }));
            }
            return [];
        },

        getInfoImages() {
            return this.getInfoList().map(item => item.image);
        },

        getCurrentInfoItem() {
            const list = this.getInfoList();
            if (!list || list.length === 0) return { title: '', description: '', features: [], specifications: [] };
            return list[Math.min(this.infoSlideIndex, list.length - 1)] || list[0];
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
                document.getElementById('info-description-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
            });
        },

        scrollInfoPanel(delta) {
            document.getElementById('info-description-scroll')?.scrollBy({ top: delta, behavior: 'smooth' });
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

        // --- 2D GRID NAVIGATION (LANGUAGES MODAL) ---
        handleLanguagesGridNavigation(e) {
            const total = this.availableLanguages.length;
            const cols = 3;

            if (TVRemoteManager.matches(e, 'LEFT')) {
                e.preventDefault();
                this.justSelectedLang = false;
                if (typeof this.activeLangFocusIndex === 'number') {
                    if (this.activeLangFocusIndex % cols > 0) { this.activeLangFocusIndex -= 1; this.focusCurrentLanguage(); }
                } else if (this.activeLangFocusIndex === 'cancel') {
                    this.activeLangFocusIndex = 'apply'; this.focusCurrentLanguage();
                }
                return true;
            }
            if (TVRemoteManager.matches(e, 'RIGHT')) {
                e.preventDefault();
                this.justSelectedLang = false;
                if (typeof this.activeLangFocusIndex === 'number') {
                    if ((this.activeLangFocusIndex % cols < cols - 1) && this.activeLangFocusIndex + 1 < total) {
                        this.activeLangFocusIndex += 1; this.focusCurrentLanguage();
                    }
                } else if (this.activeLangFocusIndex === 'apply') {
                    this.activeLangFocusIndex = 'cancel'; this.focusCurrentLanguage();
                }
                return true;
            }
            if (TVRemoteManager.matches(e, 'UP')) {
                e.preventDefault();
                this.justSelectedLang = false;
                if (typeof this.activeLangFocusIndex === 'number') {
                    if (Math.floor(this.activeLangFocusIndex / cols) > 0) {
                        this.activeLangFocusIndex -= cols; this.focusCurrentLanguage();
                    } else {
                        document.getElementById('tv-header-back-btn')?.focus();
                    }
                } else if (this.activeLangFocusIndex === 'apply' || this.activeLangFocusIndex === 'cancel') {
                    const selIdx = this.availableLanguages.findIndex(l => l.file === this.selectedLangFile);
                    this.activeLangFocusIndex = selIdx >= 0 ? selIdx : (total - 1);
                    this.focusCurrentLanguage();
                }
                return true;
            }
            if (TVRemoteManager.matches(e, 'DOWN')) {
                e.preventDefault();
                if (document.activeElement === document.getElementById('tv-header-back-btn')) {
                    document.getElementById('tv-header-back-btn')?.blur();
                    this.activeLangFocusIndex = 0; this.focusCurrentLanguage(); return true;
                }
                if (this.justSelectedLang) {
                    this.justSelectedLang = false; this.activeLangFocusIndex = 'apply'; this.focusCurrentLanguage(); return true;
                }
                if (typeof this.activeLangFocusIndex === 'number') {
                    if (this.activeLangFocusIndex + cols < total) this.activeLangFocusIndex += cols;
                    else this.activeLangFocusIndex = 'apply';
                    this.focusCurrentLanguage();
                }
                return true;
            }
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
                    document.activeElement?.click?.();
                }
                return true;
            }
            return false;
        },

        // --- GLOBAL REMOTE EVENT DISPATCHER ---
        handleGlobalKeys(e) {
            const now = Date.now();
            const isDirection = TVRemoteManager.matches(e, 'LEFT') || TVRemoteManager.matches(e, 'RIGHT') || TVRemoteManager.matches(e, 'UP') || TVRemoteManager.matches(e, 'DOWN');
            const isAction = TVRemoteManager.matches(e, 'ENTER') || TVRemoteManager.matches(e, 'BACK') || TVRemoteManager.matches(e, 'HOME') || TVRemoteManager.matches(e, 'EXIT');

            if (isDirection) {
                if (now - this.lastNavTime < this.navThrottleMs) { e.preventDefault(); return; }
                this.lastNavTime = now;
            }
            if (isAction) {
                if (now - this.lastActionTime < this.actionThrottleMs) { e.preventDefault(); return; }
                this.lastActionTime = now;
            }

            if (TVRemoteManager.matches(e, 'BACK')) { e.preventDefault(); this.goBack(); return; }
            if (TVRemoteManager.matches(e, 'HOME')) {
                e.preventDefault(); this.stopInfoAutoSlide();
                if (document.activeElement?.blur) document.activeElement.blur();
                this.currentView = 'home'; this.menuStack = []; this.currentMenuList = this.menuItems; this.activeMenuIndex = 0;
                return;
            }

            if (['language', 'languages'].includes(this.currentView)) {
                if (this.handleLanguagesGridNavigation(e)) return;
            }

            if (['apps', 'applications'].includes(this.currentView)) {
                if (this.handleApplicationsGridNavigation(e)) return;
            }

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
            if (TVRemoteManager.matches(e, 'UP')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    const cur = this.currentMenuList[this.activeMenuIndex];
                    if (cur) this.selectMenuItem(cur);
                } else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) {
                    const el = document.getElementById('info-description-scroll');
                    const backBtn = document.getElementById('tv-header-back-btn');
                    if (el && el.scrollTop > 20) this.scrollInfoPanel(-150);
                    else if (backBtn) backBtn.focus();
                } else {
                    TVRemoteManager.navigateSpatial('up');
                }
                return;
            }
            if (TVRemoteManager.matches(e, 'DOWN')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    if (this.menuStack.length > 0) this.goBack();
                } else if (['hotel_info', 'room_info', 'amenities'].includes(this.currentView)) {
                    const backBtn = document.getElementById('tv-header-back-btn');
                    if (document.activeElement === backBtn) backBtn.blur();
                    this.scrollInfoPanel(150);
                } else {
                    TVRemoteManager.navigateSpatial('down');
                }
                return;
            }
            if (TVRemoteManager.matches(e, 'ENTER')) {
                e.preventDefault();
                if (this.currentView === 'home') {
                    const cur = this.currentMenuList[this.activeMenuIndex];
                    if (cur) this.selectMenuItem(cur);
                } else {
                    const el = document.activeElement;
                    if (el && el !== document.body && typeof el.click === 'function') el.click();
                }
                return;
            }

            const digit = TVRemoteManager.getDigit(e);
            if (digit !== null && typeof window.onTVNumericInput === 'function') window.onTVNumericInput(digit);
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
