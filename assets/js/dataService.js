/**
 * Universal TV Data Service Repository (dataService.js)
 * Standalone data layer for local cache, data.json, and check-version API.
 */
'use strict';

const TVDataService = {
    async loadConfig(forceApi = false) {
        let config = null;
        let token = localStorage.getItem('authToken');

        // 1. Check parent/host frame
        if (window.tvLoginData?.data || window.tvLoginData) {
            config = window.tvLoginData.data || window.tvLoginData;
        } else if (window.parent?.tvLoginData) {
            config = window.parent.tvLoginData.data || window.parent.tvLoginData;
        }

        // 2. Fetch local data.json
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

        // 3. Remote API check-version if online
        if ((forceApi || !config) && navigator.onLine && token) {
            try {
                const apiRes = await fetch("https://tvapp.digiemperor.com/api/tv/template/check-version", {
                    method: "GET",
                    headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` }
                });
                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    const fresh = apiData.data || apiData;
                    if (fresh?.hotel || fresh?.device) {
                        config = fresh;
                        if (!config.auth) config.auth = { token };
                        const fullPayload = { status: true, message: "TV data updated.", data: config };
                        if (window.flutterBridge?.saveDeviceConfig) {
                            window.flutterBridge.saveDeviceConfig(fullPayload).catch(() => {});
                        }
                    }
                }
            } catch (apiErr) {
                console.warn('[DataService] Remote API fallback:', apiErr);
            }
        }

        // 4. Local cache persistence
        if (config) {
            localStorage.setItem('cachedHotelData', JSON.stringify(config));
        } else {
            try {
                const cached = localStorage.getItem('cachedHotelData');
                if (cached) config = JSON.parse(cached);
            } catch (_) {}
        }
        return config;
    }
};

window.TVDataService = TVDataService;
