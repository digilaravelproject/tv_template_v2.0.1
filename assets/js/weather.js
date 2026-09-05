/**
 * Hotel Luxury TV Template v2.0.1 - Weather Controller Module (weather.js)
 * Clean Architecture & Dynamic Offline-First Pattern:
 * - 100% Dynamic City: Extracted strictly from data.json (hotel.city -> hotel.hotel_location -> weather.city)
 * - Zero Hardcoded Cities, Coordinates, or Dummy Fallback Temperatures
 * - Open-Meteo Geocoding + High-Precision Forecast + Air Quality (US AQI)
 * - Background Auto-Sync on Template Load with 15-Minute Polling Interval
 * - Dynamic Header Weather Display (City + °C / °F)
 * - Offline Protection: If offline, hides header weather and prevents API requests
 * - Live Real-Time Manual Refresh with Real-Time "Last Updated" timestamp
 * - Full Multilingual Localization support
 */
'use strict';

window.TVWeatherController = {
    weatherHtml: '',
    weatherLoading: false,
    isRefreshing: false,
    weatherError: null,
    weatherData: null,
    weatherCity: '',
    weatherIsCached: false,
    weatherLastUpdated: '',
    weatherRefreshTimer: null,
    weatherPollIntervalMs: 15 * 60 * 1000, // 15 Minutes auto background sync

    initWeatherBackgroundSync() {
        this.weatherCity = this.resolveWeatherCity();

        // Update header immediately with resolved city from data.json so it is never blank
        this.updateWeatherHeaderStr();

        // Listen for online/offline events (attach only once)
        if (!this._weatherListenersAttached) {
            this._weatherListenersAttached = true;
            window.addEventListener('online', () => {
                console.log('[TVWeather] Network online detected. Triggering background sync.');
                this.loadWeatherData(true).then(() => {
                    this.updateWeatherHeaderStr();
                }).catch(() => {});
            });

            window.addEventListener('offline', () => {
                console.log('[TVWeather] Network offline detected. Hiding weather temperature.');
                this.updateWeatherHeaderStr();
            });
        }

        // Initial background fetch on load if online
        if (navigator.onLine && this.weatherCity) {
            this.loadWeatherData(false).then(() => {
                this.updateWeatherHeaderStr();
            }).catch(() => {});
        } else {
            this.updateWeatherHeaderStr();
        }

        // Setup 15-minute background auto-refresh timer
        if (this.weatherRefreshTimer) clearInterval(this.weatherRefreshTimer);
        this.weatherRefreshTimer = setInterval(() => {
            if (navigator.onLine && this.weatherCity) {
                console.log('[TVWeather] 15-minute background refresh triggered.');
                this.loadWeatherData(true).then(() => {
                    this.updateWeatherHeaderStr();
                }).catch(() => {});
            } else {
                this.updateWeatherHeaderStr();
            }
        }, this.weatherPollIntervalMs);
    },

    updateWeatherHeaderStr() {
        const city = this.weatherData?.city || this.weatherCity || this.resolveWeatherCity() || this.hotelData?.hotel?.city || '';

        // If offline: user requested "sirf weather hide krna hain atleast tum json me se city to display krskte ho ?"
        if (!navigator.onLine) {
            this.weatherStr = city; // Show city from data.json, hide temperature
            return;
        }

        const cur = this.weatherData?.current;
        if (cur && cur.temp !== null && cur.temp !== undefined) {
            const c = cur.temp;
            const f = Math.round((c * 9) / 5 + 32);
            this.weatherStr = `${city} ${c > 0 ? '+' : ''}${c}°C / ${f}°F`.trim();
        } else {
            // While online and fetching in background, show city immediately from data.json
            this.weatherStr = city;
        }
    },

    async openWeather() {
        if (!navigator.onLine) {
            if (typeof this.showToast === 'function') {
                this.showToast('No Internet Connection. Please connect to internet.');
            }
            return;
        }

        this.weatherCity = this.resolveWeatherCity();
        await this.loadWeatherData(false);
        this.$nextTick(() => {
            document.getElementById('tv-header-back-btn')?.focus();
        });
    },

    resolveWeatherCity() {
        const h = this.hotelData || {};
        let city = h.hotel?.city || h.weather?.city || '';
        
        // If city is not directly specified, attempt extraction from hotel_location string
        if (!city && h.hotel?.hotel_location) {
            const parts = h.hotel.hotel_location.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 3) {
                // E.g. "Street, Area, City, State Pincode, Country" -> grab city part
                city = parts[parts.length - 3] || parts[parts.length - 2];
            } else if (parts.length >= 1) {
                city = parts[0];
            }
        }

        // Clean up city string
        if (typeof city === 'string') {
            city = city.replace(/[0-9\-_]/g, '').trim();
            if (city.includes(',')) {
                const pieces = city.split(',').map(p => p.trim()).filter(Boolean);
                city = pieces[pieces.length - 1] || pieces[0] || '';
            }
        }

        return city || '';
    },

    async refreshWeather() {
        if (!navigator.onLine) {
            if (typeof this.showToast === 'function') {
                this.showToast('No Internet Connection. Please connect to internet.');
            }
            return;
        }

        if (this.isRefreshing || this.weatherLoading) return;
        this.isRefreshing = true;

        try {
            await this.loadWeatherData(true);
            this.updateWeatherHeaderStr();
            if (typeof this.showToast === 'function') {
                const temp = this.weatherData?.current?.temp !== null ? `${this.weatherData.current.temp > 0 ? '+' : ''}${this.weatherData.current.temp}°C` : '';
                this.showToast(`Live weather updated: ${this.weatherCity} ${temp}`.trim());
            }
        } finally {
            setTimeout(() => { this.isRefreshing = false; }, 600);
        }
    },

    async loadWeatherData(force = false) {
        // If offline: do NOT hit API at all!
        if (!navigator.onLine) {
            this.weatherLoading = false;
            this.weatherError = 'No Internet Connection. Please connect to internet.';
            this.updateWeatherHeaderStr();
            return;
        }

        const city = this.resolveWeatherCity();
        this.weatherCity = city;

        if (!city) {
            this.weatherError = 'Location information is currently unavailable.';
            this.weatherLoading = false;
            return;
        }

        const cacheKey = `weather_cache_${city.toLowerCase().replace(/\s+/g, '_')}`;
        const timeKey = `weather_cache_time_${city.toLowerCase().replace(/\s+/g, '_')}`;
        const maxAge = this.weatherPollIntervalMs; // 15 minutes cache lifetime

        // 1. Check valid cache if not forced
        if (!force) {
            try {
                const cachedTime = parseInt(localStorage.getItem(timeKey) || '0', 10);
                const cachedStr = localStorage.getItem(cacheKey);
                if (cachedStr && (Date.now() - cachedTime < maxAge)) {
                    this.weatherData = JSON.parse(cachedStr);
                    this.weatherLastUpdated = this.weatherData.lastUpdated || '';
                    this.weatherIsCached = false;
                    this.weatherLoading = false;
                    this.weatherError = null;
                    this.updateWeatherHeaderStr();
                    return;
                }
            } catch (_) {}
        }

        this.weatherLoading = true;
        this.weatherError = null;

        try {
            // A. Geocoding lookup for exact coordinates of this specific city
            const coords = await this.fetchCityCoordinates(city);
            if (!coords) {
                throw new Error(`Coordinates could not be resolved for location: "${city}"`);
            }

            // B. Parallel Forecast and Air Quality queries
            const [forecastRes, aqiRes] = await Promise.all([
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,pressure_msl,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code&timezone=${encodeURIComponent(coords.timezone)}`),
                fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}&current=us_aqi`)
            ]);

            if (!forecastRes.ok) throw new Error(`Weather Forecast API error: HTTP ${forecastRes.status}`);
            const forecast = await forecastRes.json();

            let aqi = null;
            if (aqiRes.ok) {
                try {
                    const aqiJson = await aqiRes.json();
                    if (aqiJson?.current?.us_aqi !== undefined) {
                        aqi = Math.round(aqiJson.current.us_aqi);
                    }
                } catch (_) {}
            }

            const cur = forecast.current || {};
            const daily = forecast.daily || {};

            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
            const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const lastUpdatedStr = `${dateStr}, ${timeStr}`;

            const formatted = {
                city: city,
                timezone: coords.timezone,
                lastUpdated: lastUpdatedStr,
                current: {
                    temp: cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : null,
                    feelsLike: cur.apparent_temperature !== undefined ? Math.round(cur.apparent_temperature) : (cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : null),
                    humidity: cur.relative_humidity_2m !== undefined ? Math.round(cur.relative_humidity_2m) : null,
                    wind: cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : null,
                    pressure: (cur.pressure_msl ?? cur.surface_pressure) !== undefined ? Math.round(cur.pressure_msl ?? cur.surface_pressure) : null,
                    weatherCode: cur.weather_code !== undefined ? cur.weather_code : 0,
                    aqi: aqi
                },
                daily: (daily.time || []).slice(0, 7).map((dateStrVal, i) => ({
                    date: dateStrVal,
                    maxTemp: daily.temperature_2m_max?.[i] !== undefined ? Math.round(daily.temperature_2m_max[i]) : null,
                    minTemp: daily.temperature_2m_min?.[i] !== undefined ? Math.round(daily.temperature_2m_min[i]) : null,
                    weatherCode: daily.weather_code?.[i] !== undefined ? daily.weather_code[i] : 0,
                    sunrise: daily.sunrise?.[i] || '',
                    sunset: daily.sunset?.[i] || ''
                }))
            };

            this.weatherData = formatted;
            this.weatherLastUpdated = lastUpdatedStr;
            this.weatherIsCached = false;
            this.weatherLoading = false;
            this.weatherError = null;

            // Save to LocalStorage cache (15 min expiry)
            try {
                localStorage.setItem(cacheKey, JSON.stringify(formatted));
                localStorage.setItem(timeKey, Date.now().toString());
            } catch (_) {}

            this.updateWeatherHeaderStr();

        } catch (err) {
            console.warn('[TVWeather] Dynamic fetch warning:', err);
            this.loadCachedOrFallbackWeather(city, cacheKey);
            this.updateWeatherHeaderStr();
        }
    },

    async loadCachedOrFallbackWeather(city, cacheKey) {
        this.weatherLoading = false;

        // Check local storage cache first
        try {
            const cachedStr = localStorage.getItem(cacheKey);
            if (cachedStr) {
                this.weatherData = JSON.parse(cachedStr);
                this.weatherLastUpdated = this.weatherData.lastUpdated || '';
                this.weatherIsCached = true;
                this.weatherError = null;
                return;
            }
        } catch (_) {}

        // Local fallback JSON file (safely handles empty or blank file in pure Vanilla JS)
        try {
            const res = await fetch(`assets/data/weather_data.json?t=${Date.now()}`);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 2) {
                    const raw = JSON.parse(text);
                    if (raw && (raw.current?.temperature_2m !== undefined || raw.extracted_data?.temp !== undefined)) {
                        const cur = raw.current || {};
                        const d = raw.daily || {};
                        const ext = raw.extracted_data || {};

                        const now = new Date();
                        const fallbackTime = `${now.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;

                        this.weatherData = {
                            city: city,
                            timezone: raw.timezone || 'auto',
                            lastUpdated: fallbackTime,
                            current: {
                                temp: cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : (ext.temp !== undefined ? Math.round(ext.temp) : null),
                                feelsLike: cur.apparent_temperature !== undefined ? Math.round(cur.apparent_temperature) : (cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : null),
                                humidity: cur.relative_humidity_2m !== undefined ? Math.round(cur.relative_humidity_2m) : (ext.humidity !== undefined ? Math.round(ext.humidity) : null),
                                wind: cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : (ext.wind !== undefined ? Math.round(ext.wind) : null),
                                pressure: (cur.surface_pressure ?? ext.pressure) !== undefined ? Math.round(cur.surface_pressure ?? ext.pressure) : null,
                                weatherCode: cur.weather_code !== undefined ? cur.weather_code : 0,
                                aqi: ext.aqi !== undefined ? Math.round(ext.aqi) : null
                            },
                            daily: (d.time || []).slice(0, 7).map((dateStrVal, i) => ({
                                date: dateStrVal,
                                maxTemp: d.temperature_2m_max?.[i] !== undefined ? Math.round(d.temperature_2m_max[i]) : null,
                                minTemp: d.temperature_2m_min?.[i] !== undefined ? Math.round(d.temperature_2m_min[i]) : null,
                                weatherCode: d.weather_code?.[i] !== undefined ? d.weather_code[i] : 0,
                                sunrise: d.sunrise?.[i] || ext.sunrise || '',
                                sunset: d.sunset?.[i] || ext.sunset || ''
                            }))
                        };
                        this.weatherLastUpdated = fallbackTime;
                        this.weatherIsCached = true;
                        this.weatherError = null;
                        return;
                    }
                }
            }
        } catch (fbErr) {
            console.warn('[TVWeather] Fallback load error:', fbErr);
        }

        // If file was blank or unavailable, but we have internet, fetch live API
        if (navigator.onLine) {
            this.loadWeatherData(true);
            return;
        }

        this.weatherError = `No weather data available for ${city}. Please connect to internet.`;
    },

    async fetchCityCoordinates(city) {
        if (!city) return null;
        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
            if (res.ok) {
                const data = await res.json();
                if (data?.results?.[0]) {
                    return {
                        lat: data.results[0].latitude,
                        lon: data.results[0].longitude,
                        timezone: data.results[0].timezone || 'auto'
                    };
                }
            }
        } catch (e) {
            console.warn('[TVWeather] Geocoding lookup warning:', e);
        }
        return null;
    },

    getWeatherIcon(code) {
        if (code === 0) return 'assets/images/weather/sunny.png';
        if (code >= 1 && code <= 3) return 'assets/images/weather/cloudy.png';
        if (code >= 45 && code <= 48) return 'assets/images/weather/cloudy.png';
        if (code >= 51 && code <= 67) return 'assets/images/weather/rainy.png';
        if (code >= 71 && code <= 77) return 'assets/images/weather/cloudy.png';
        if (code >= 80 && code <= 82) return 'assets/images/weather/rainy-day.png';
        if (code >= 85 && code <= 86) return 'assets/images/weather/cloudy.png';
        if (code >= 95) return 'assets/images/weather/storm.png';
        return 'assets/images/weather/sunny.png';
    },

    getWeatherDesc(code) {
        if (code === 0) return 'Clear Sky';
        if (code === 1) return 'Mainly Clear';
        if (code === 2) return 'Partly Cloudy';
        if (code === 3) return 'Overcast';
        if (code === 45 || code === 48) return 'Foggy';
        if (code >= 51 && code <= 55) return 'Light Drizzle';
        if (code >= 61 && code <= 65) return 'Rain Showers';
        if (code >= 71 && code <= 77) return 'Snow Flurries';
        if (code >= 80 && code <= 82) return 'Heavy Showers';
        if (code >= 95) return 'Thunderstorm';
        return 'Clear Sky';
    },

    getAqiInfo(aqi) {
        if (aqi === null || aqi === undefined || isNaN(aqi)) {
            return { label: 'N/A', textClass: 'text-slate-400', bgClass: 'bg-white/5 border-white/10' };
        }
        const val = parseInt(aqi, 10);
        if (val <= 50) return { label: 'GOOD', textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/15 border-emerald-500/40' };
        if (val <= 100) return { label: 'SATISFACTORY', textClass: 'text-lime-400', bgClass: 'bg-lime-500/15 border-lime-500/40' };
        if (val <= 200) return { label: 'MODERATE', textClass: 'text-amber-400', bgClass: 'bg-amber-500/15 border-amber-500/40' };
        if (val <= 300) return { label: 'POOR', textClass: 'text-orange-400', bgClass: 'bg-orange-500/15 border-orange-500/40' };
        if (val <= 400) return { label: 'VERY POOR', textClass: 'text-red-400', bgClass: 'bg-red-500/15 border-red-500/40' };
        return { label: 'SEVERE', textClass: 'text-rose-500', bgClass: 'bg-rose-500/20 border-rose-500/50' };
    },

    formatWeatherDay(isoDate, index) {
        if (index === 0) return this.t('today', 'TODAY');
        if (!isoDate) return '--';
        const d = new Date(isoDate);
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const k = dayKeys[d.getDay()];
        return this.t(`days_short.${k}`, k ? k.toUpperCase() : '--');
    },

    formatWeatherDate(isoDate) {
        if (!isoDate) return '';
        const d = new Date(isoDate);
        const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const m = monthKeys[d.getMonth()];
        const mStr = this.t(`months.${m}`, m ? m.toUpperCase() : '');
        return `${d.getDate()} ${mStr}`;
    },

    formatTimeFromIso(isoStr) {
        if (!isoStr) return '--:--';
        try {
            const d = new Date(isoStr);
            let hours = d.getHours();
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
        } catch (_) {
            return '--:--';
        }
    }
};
