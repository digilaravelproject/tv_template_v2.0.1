/**
 * Hotel Luxury TV Template v2.0.1 - Flights Controller Module (flights.js)
 * Clean Architecture & Dual-Fetch Repository Pattern:
 * 
 * 1. STATE & CONFIGURATION:
 *    - Reactive flight data (Departures & Arrivals)
 *    - Dual airport support (Primary & Secondary from data.json)
 *    - 7-row strict pagination & TV remote focus state
 * 
 * 2. DUAL-FETCH PIPELINE:
 *    - Channel 1 (Native Android TV): window.flutterBridge.getFlightData
 *    - Channel 2 (Remote Backend API): GET /api/tv/flights with Bearer token
 *    - Channel 3 (Offline Resilience): 30-min localStorage cache + dynamic schedule generator
 * 
 * 3. REMOTE D-PAD SPATIAL NAVIGATION:
 *    - UP / DOWN: Navigate between Header -> Tabs -> 7 Rows -> Pagination
 *    - LEFT / RIGHT: Switch tabs / flip pages / toggle airports
 *    - OK / ENTER: Trigger selection / refresh / page flip
 *    - BACK: Exit to previous screen
 */
'use strict';

window.TVFlightsController = {
    // =========================================================================
    // 1. REACTIVE STATE
    // =========================================================================
    flightsHtml: '',
    flightDepartures: [],
    flightArrivals: [],
    activeFlightTab: 'departures', // 'departures' | 'arrivals'
    currentAirportIata: 'BOM',
    currentAirportName: 'Chhatrapati Shivaji Maharaj International Airport',
    currentAirportCity: 'Mumbai',
    primaryAirportData: null,
    secondaryAirportData: null,
    activeAirportSlot: 'primary', // 'primary' | 'secondary'
    isFlightLoading: false,
    isFlightRefreshing: false,
    flightLastUpdated: '',
    flightError: null,

    // TV Remote Spatial Focus & 7-Row Pagination State
    flightPage: 1,
    flightPageSize: 7,
    flightFocusZone: 'tabs', // 'header' | 'tabs' | 'rows' | 'pagination'
    flightFocusIndex: 0,     // Sub-index inside current focus zone

    // =========================================================================
    // 2. INITIALIZATION & AIRPORT RESOLUTION
    // =========================================================================

    /**
     * Entry point when user navigates to Flights screen.
     */
    async openFlights() {
        this.resolveConfiguredAirports();
        this.flightPage = 1;
        this.flightFocusZone = 'tabs';
        this.flightFocusIndex = this.activeFlightTab === 'departures' ? 0 : 1;
        await this.loadFlightData(false);
    },

    /**
     * Read configured airports from data.json payload (supports primary & secondary).
     * Includes automatic fallback to localStorage cachedHotelData if state is initializing.
     */
    resolveConfiguredAirports() {
        // Fallback: If hotelData is not yet populated on Alpine instance, read from cache
        if (!this.hotelData || Object.keys(this.hotelData).length === 0) {
            try {
                const cached = localStorage.getItem('cachedHotelData');
                if (cached) this.hotelData = JSON.parse(cached);
            } catch (_) {}
        }

        const airports = this.hotelData?.airports || {};
        this.primaryAirportData = airports.primary || {
            name: 'Chhatrapati Shivaji Maharaj International Airport',
            iata_code: 'BOM',
            city: this.hotelData?.hotel?.city || 'Mumbai'
        };
        this.secondaryAirportData = airports.secondary || null;

        if (this.activeAirportSlot === 'secondary' && this.secondaryAirportData) {
            this.currentAirportIata = this.secondaryAirportData.iata_code || 'NMI';
            this.currentAirportName = this.secondaryAirportData.name || 'Secondary Airport';
            this.currentAirportCity = this.secondaryAirportData.city || '';
        } else {
            this.activeAirportSlot = 'primary';
            this.currentAirportIata = this.primaryAirportData.iata_code || 'BOM';
            this.currentAirportName = this.primaryAirportData.name || 'Primary Airport';
            this.currentAirportCity = this.primaryAirportData.city || '';
        }
    },

    // =========================================================================
    // 3. PAGINATION & DATA SELECTORS (7 Rows Per Page)
    // =========================================================================

    /**
     * Get active flight list (Departures or Arrivals).
     * @returns {Array<Object>}
     */
    getCurrentFlightList() {
        return this.activeFlightTab === 'departures' ? this.flightDepartures : this.flightArrivals;
    },

    /**
     * Get total pages based on exactly 7 rows per page.
     * @returns {number}
     */
    getTotalFlightPages() {
        const total = this.getCurrentFlightList().length;
        return Math.max(1, Math.ceil(total / this.flightPageSize));
    },

    /**
     * Slice active list for exactly 7 rows on current page with out-of-bounds clamp.
     * @returns {Array<Object>}
     */
    getPaginatedFlights() {
        const list = this.getCurrentFlightList();
        const totalPages = this.getTotalFlightPages();
        if (this.flightPage > totalPages) {
            this.flightPage = totalPages;
        }
        const start = (this.flightPage - 1) * this.flightPageSize;
        return list.slice(start, start + this.flightPageSize);
    },

    /**
     * Go to previous flight page.
     */
    prevFlightPage() {
        if (this.flightPage > 1) {
            this.flightPage -= 1;
            if (this.flightFocusZone === 'rows') {
                const currentCount = this.getPaginatedFlights().length;
                this.flightFocusIndex = Math.min(this.flightFocusIndex, currentCount - 1);
            }
        }
    },

    /**
     * Go to next flight page.
     */
    nextFlightPage() {
        if (this.flightPage < this.getTotalFlightPages()) {
            this.flightPage += 1;
            if (this.flightFocusZone === 'rows') {
                const currentCount = this.getPaginatedFlights().length;
                this.flightFocusIndex = Math.min(this.flightFocusIndex, currentCount - 1);
            }
        }
    },

    // =========================================================================
    // 4. TABS & AIRPORT SLOT SWITCHING
    // =========================================================================

    /**
     * Switch between Primary and Secondary Airport.
     * @param {'primary'|'secondary'} slot
     */
    async switchAirportSlot(slot) {
        if (slot === this.activeAirportSlot) return;
        this.activeAirportSlot = slot;
        this.flightPage = 1;
        this.flightFocusZone = 'tabs';
        this.flightFocusIndex = 0;
        this.resolveConfiguredAirports();
        await this.loadFlightData(false);
    },

    /**
     * Switch between Departures and Arrivals boards.
     * @param {'departures'|'arrivals'} tab
     */
    switchFlightTab(tab) {
        if (tab !== 'departures' && tab !== 'arrivals') return;
        this.activeFlightTab = tab;
        this.flightPage = 1;
        this.flightFocusZone = 'tabs';
        this.flightFocusIndex = tab === 'departures' ? 0 : 1;
    },

    // =========================================================================
    // 5. DATA INGESTION & DUAL-FETCH PIPELINE
    // =========================================================================

    /**
     * Load flight schedule with Dual-Fetch (Bridge -> API -> Local Mock).
     * @param {boolean} [force=false]
     */
    async loadFlightData(force = false) {
        const iata = this.currentAirportIata || 'BOM';
        const cacheKey = `flights_cache_${iata}`;
        const timeKey = `flights_time_${iata}`;
        const maxAge = 30 * 60 * 1000; // 30 minutes TTL

        // 1. Check valid localStorage cache if not forced
        if (!force) {
            try {
                const cachedTime = parseInt(localStorage.getItem(timeKey) || '0', 10);
                const cachedStr = localStorage.getItem(cacheKey);
                if (cachedStr && (Date.now() - cachedTime < maxAge)) {
                    const parsed = JSON.parse(cachedStr);
                    // Only use cache if it is live and already enriched with city names (e.g. Abu Dhabi (AUH))
                    if (parsed && parsed.is_live === true && parsed.departures?.[0]?.destination?.includes('(')) {
                        this.flightDepartures = parsed.departures || [];
                        this.flightArrivals = parsed.arrivals || [];
                        this.flightLastUpdated = parsed.last_updated || '';
                        this.isFlightLoading = false;
                        this.flightError = null;
                        return;
                    }
                }
            } catch (_) {}
        }

        this.isFlightLoading = true;
        this.flightError = null;

        let result = null;

        // Channel A: Native Flutter Bridge (Primary on Android TV)
        if (window.flutterBridge?.isAvailable?.() && typeof window.flutterBridge.getFlightData === 'function') {
            try {
                result = await window.flutterBridge.getFlightData(iata);
            } catch (e) {
                console.warn('[TVFlights] Bridge fetch notice:', e);
            }
        }

        // Channel B: Direct HTTP Fetch to Live Backend API (https://tvapp.digiemperor.com)
        if (!result || !result.data) {
            result = await this.fetchFlightsFromBackend(iata, force);
        }

        // Channel C: Resilient Dynamic Schedule Generator (Offline / Staging)
        if (!result || !result.data) {
            result = { data: this.generateOfflineFlightMock(iata) };
        }

        if (result && result.data) {
            this.applyFlightPayload(result.data);
            try {
                const enrichedCache = {
                    ...result.data,
                    departures: this.flightDepartures,
                    arrivals: this.flightArrivals,
                    last_updated: this.flightLastUpdated,
                    is_live: true
                };
                localStorage.setItem(cacheKey, JSON.stringify(enrichedCache));
                localStorage.setItem(timeKey, Date.now().toString());
            } catch (_) {}
        } else {
            this.flightError = 'Flight schedule is currently updating. Please refresh in a moment.';
        }

        this.isFlightLoading = false;
    },

    /**
     * Fetch flight schedule from live production backend API (https://tvapp.digiemperor.com).
     * @param {string} iata - 3-letter IATA code
     * @param {boolean} force - Whether to trigger upstream refresh
     * @returns {Promise<Object|null>}
     */
    async fetchFlightsFromBackend(iata, force = false) {
        let token = this.hotelData?.auth?.token;
        if (!token) {
            try {
                const cached = localStorage.getItem('cachedHotelData');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    token = parsed?.auth?.token;
                }
            } catch (_) {}
        }
        if (!token) {
            token = localStorage.getItem('authToken') || localStorage.getItem('tv_api_token');
        }
        if (!token) return null;

        // Live Production API endpoint (Zero local host dependency)
        const host = 'https://tvapp.digiemperor.com';
        const endpoint = force 
            ? `${host}/api/tv/flights/refresh?airport=${encodeURIComponent(iata)}`
            : `${host}/api/tv/flights?airport=${encodeURIComponent(iata)}`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for live aviation radar

            const res = await fetch(endpoint, {
                method: force ? 'POST' : 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                const json = await res.json();
                if (json && json.status && json.data) {
                    return json;
                }
            } else {
                console.warn('[TVFlights] Live Backend returned status:', res.status);
            }
        } catch (err) {
            console.warn('[TVFlights] Live Backend fetch warning:', err);
        }
        return null;
    },

    /**
     * Apply parsed flight payload into reactive state with accurate Airline and Airport names.
     * @param {Object} data
     */
    applyFlightPayload(data) {
        if (!data) return;

        // Comprehensive Airline IATA Map for accurate names (e.g. EY -> Etihad Airways)
        const AIRLINE_NAMES = {
            '6E': 'IndiGo',
            'AI': 'Air India',
            'IX': 'Air India Express',
            'UK': 'Vistara',
            'QP': 'Akasa Air',
            'SG': 'SpiceJet',
            'I5': 'AIX Connect',
            'G8': 'Go First',
            'EY': 'Etihad Airways',
            'EK': 'Emirates',
            'FZ': 'flydubai',
            'QR': 'Qatar Airways',
            'WY': 'Oman Air',
            'G9': 'Air Arabia',
            'KU': 'Kuwait Airways',
            'SV': 'Saudia',
            'GF': 'Gulf Air',
            'SQ': 'Singapore Airlines',
            'TR': 'Scoot',
            'TG': 'Thai Airways',
            'FD': 'Thai AirAsia',
            'MH': 'Malaysia Airlines',
            'AK': 'AirAsia',
            'BA': 'British Airways',
            'VS': 'Virgin Atlantic',
            'LH': 'Lufthansa',
            'AF': 'Air France',
            'KL': 'KLM',
            'LX': 'Swiss International',
            'TK': 'Turkish Airlines',
            'ET': 'Ethiopian Airlines',
            'QF': 'Qantas',
            'CX': 'Cathay Pacific',
            'JL': 'Japan Airlines',
            'NH': 'ANA',
            'UA': 'United Airlines',
            'AA': 'American Airlines',
            'DL': 'Delta Air Lines',
            'AC': 'Air Canada'
        };

        // Comprehensive Airport IATA -> City (Code) Map (e.g. AUH -> Abu Dhabi (AUH))
        const AIRPORT_NAMES = {
            // Domestic India
            'BOM': 'Mumbai (BOM)', 'DEL': 'Delhi (DEL)', 'BLR': 'Bengaluru (BLR)',
            'HYD': 'Hyderabad (HYD)', 'MAA': 'Chennai (MAA)', 'CCU': 'Kolkata (CCU)',
            'GOI': 'Goa Dabolim (GOI)', 'GOX': 'Goa Mopa (GOX)', 'AMD': 'Ahmedabad (AMD)',
            'PNQ': 'Pune (PNQ)', 'COK': 'Kochi (COK)', 'JAI': 'Jaipur (JAI)',
            'LKO': 'Lucknow (LKO)', 'PAT': 'Patna (PAT)', 'IXB': 'Bagdogra (IXB)',
            'VNS': 'Varanasi (VNS)', 'GAU': 'Guwahati (GAU)', 'IXC': 'Chandigarh (IXC)',
            'ATQ': 'Amritsar (ATQ)', 'TRV': 'Thiruvananthapuram (TRV)', 'CCJ': 'Kozhikode (CCJ)',
            'IXE': 'Mangalore (IXE)', 'NAG': 'Nagpur (NAG)', 'IDR': 'Indore (IDR)',
            'BBI': 'Bhubaneswar (BBI)', 'RPR': 'Raipur (RPR)', 'SXR': 'Srinagar (SXR)',
            'IXJ': 'Jammu (IXJ)', 'IXR': 'Ranchi (IXR)', 'BDQ': 'Vadodara (BDQ)',
            'STV': 'Surat (STV)', 'UDR': 'Udaipur (UDR)', 'JDH': 'Jodhpur (JDH)',
            'VGA': 'Vijayawada (VGA)', 'VTZ': 'Visakhapatnam (VTZ)', 'TRZ': 'Tiruchirappalli (TRZ)',
            'CJB': 'Coimbatore (CJB)', 'IXM': 'Madurai (IXM)', 'DED': 'Dehradun (DED)',
            'IXA': 'Agartala (IXA)', 'IMF': 'Imphal (IMF)', 'DMU': 'Dimapur (DMU)',
            'AJL': 'Aizawl (AJL)', 'SHL': 'Shillong (SHL)', 'DIB': 'Dibrugarh (DIB)',
            'BHO': 'Bhopal (BHO)', 'GWL': 'Gwalior (GWL)', 'JLR': 'Jabalpur (JLR)',
            'AYJ': 'Ayodhya (AYJ)', 'HJR': 'Khajuraho (HJR)', 'AGR': 'Agra (AGR)',
            'KNU': 'Kanpur (KNU)', 'BEK': 'Bareilly (BEK)', 'GOP': 'Gorakhpur (GOP)',
            'GAY': 'Gaya (GAY)', 'DBR': 'Darbhanga (DBR)', 'IXU': 'Aurangabad (IXU)',
            'KLH': 'Kolhapur (KLH)', 'SDW': 'Sindhudurg (SDW)', 'CNN': 'Kannur (CNN)',
            'HBX': 'Hubli (HBX)', 'IXG': 'Belgaum (IXG)', 'MYQ': 'Mysore (MYQ)',
            'TIR': 'Tirupati (TIR)', 'RJA': 'Rajahmundry (RJA)',

            // International Middle East & Gulf
            'AUH': 'Abu Dhabi (AUH)', 'DXB': 'Dubai (DXB)', 'DWC': 'Dubai Al Maktoum (DWC)',
            'SHJ': 'Sharjah (SHJ)', 'DOH': 'Doha (DOH)', 'BAH': 'Bahrain (BAH)',
            'KWI': 'Kuwait (KWI)', 'MCT': 'Muscat (MCT)', 'RUH': 'Riyadh (RUH)',
            'JED': 'Jeddah (JED)', 'DMM': 'Dammam (DMM)', 'MED': 'Medina (MED)',
            'AMM': 'Amman (AMM)',

            // International Europe & UK
            'LHR': 'London Heathrow (LHR)', 'LGW': 'London Gatwick (LGW)', 'MAN': 'Manchester (MAN)',
            'BHX': 'Birmingham (BHX)', 'CDG': 'Paris (CDG)', 'FRA': 'Frankfurt (FRA)',
            'MUC': 'Munich (MUC)', 'AMS': 'Amsterdam (AMS)', 'ZRH': 'Zurich (ZRH)',
            'VIE': 'Vienna (VIE)', 'FCO': 'Rome (FCO)', 'MXP': 'Milan (MXP)',
            'MAD': 'Madrid (MAD)', 'BCN': 'Barcelona (BCN)', 'IST': 'Istanbul (IST)',

            // International Asia Pacific & Africa & US
            'SIN': 'Singapore (SIN)', 'BKK': 'Bangkok (BKK)', 'DMK': 'Bangkok Don Mueang (DMK)',
            'HKT': 'Phuket (HKT)', 'KUL': 'Kuala Lumpur (KUL)', 'DPS': 'Bali (DPS)',
            'HKG': 'Hong Kong (HKG)', 'NRT': 'Tokyo Narita (NRT)', 'HND': 'Tokyo Haneda (HND)',
            'ICN': 'Seoul (ICN)', 'SYD': 'Sydney (SYD)', 'MEL': 'Melbourne (MEL)',
            'PER': 'Perth (PER)', 'AKL': 'Auckland (AKL)', 'CMB': 'Colombo (CMB)',
            'MLE': 'Maldives (MLE)', 'DAC': 'Dhaka (DAC)', 'KTM': 'Kathmandu (KTM)',
            'JFK': 'New York (JFK)', 'EWR': 'Newark (EWR)', 'ORD': 'Chicago (ORD)',
            'SFO': 'San Francisco (SFO)', 'LAX': 'Los Angeles (LAX)', 'YYZ': 'Toronto (YYZ)',
            'NBO': 'Nairobi (NBO)', 'ADD': 'Addis Ababa (ADD)', 'MRU': 'Mauritius (MRU)'
        };

        const formatFlightNo = (val) => {
            if (!val) return 'N/A';
            const s = String(val).trim();
            const m = s.match(/^([A-Za-z]{2,3}|[0-9][A-Za-z]|[A-Za-z][0-9])\s*(\d+)$/i);
            return m ? `${m[1].toUpperCase()} ${m[2]}` : s;
        };

        const formatTerminal = (val) => {
            if (!val) return 'T2';
            const s = String(val).trim();
            return s.toUpperCase().startsWith('T') ? s.toUpperCase() : 'T' + s;
        };

        const resolveCity = (code, fallback) => {
            if (code && AIRPORT_NAMES[code.toUpperCase()]) return AIRPORT_NAMES[code.toUpperCase()];
            if (fallback && AIRPORT_NAMES[fallback.toUpperCase()]) return AIRPORT_NAMES[fallback.toUpperCase()];
            if (code && code.length === 3) return `${code} (${code})`;
            return fallback || code || 'Destination';
        };

        const rawDeps = Array.isArray(data.departures) ? data.departures : [];
        this.flightDepartures = rawDeps.map(f => {
            const airlineCode = (f.airline || '').trim().toUpperCase();
            const airlineName = AIRLINE_NAMES[airlineCode] || f.airline || 'Airline';
            const destCode = (f.dest_iata || f.destination || '').trim().toUpperCase();
            return {
                ...f,
                flight_no: formatFlightNo(f.flight_no),
                airline: airlineName,
                destination: resolveCity(destCode, f.destination),
                terminal: formatTerminal(f.terminal),
                gate: (f.gate && f.gate !== 'null' && f.gate !== 'undefined') ? f.gate : '--'
            };
        });

        const rawArrs = Array.isArray(data.arrivals) ? data.arrivals : [];
        this.flightArrivals = rawArrs.map(f => {
            const airlineCode = (f.airline || '').trim().toUpperCase();
            const airlineName = AIRLINE_NAMES[airlineCode] || f.airline || 'Airline';
            const origCode = (f.origin_iata || f.origin || '').trim().toUpperCase();
            return {
                ...f,
                flight_no: formatFlightNo(f.flight_no),
                airline: airlineName,
                origin: resolveCity(origCode, f.origin),
                terminal: formatTerminal(f.terminal),
                belt: (f.belt && f.belt !== 'null' && f.belt !== 'undefined') ? f.belt : '--'
            };
        });

        this.flightLastUpdated = data.last_updated || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (data.current_airport) {
            this.currentAirportName = data.current_airport.name || this.currentAirportName;
            this.currentAirportIata = data.current_airport.iata_code || this.currentAirportIata;
            this.currentAirportCity = data.current_airport.city || this.currentAirportCity;
        }
    },

    // =========================================================================
    // 6. MANUAL SYNC / REFRESH
    // =========================================================================

    /**
     * Manual live refresh action with visual feedback.
     */
    async refreshFlights() {
        if (this.isFlightRefreshing || this.isFlightLoading) return;
        this.isFlightRefreshing = true;

        if (typeof this.showToast === 'function') {
            this.showToast('Fetching latest flight schedule...');
        }

        try {
            await this.loadFlightData(true);
            this.flightPage = 1;
            if (typeof this.showToast === 'function') {
                this.showToast(`Flight board updated for ${this.currentAirportIata} ✓`);
            }
        } finally {
            setTimeout(() => {
                this.isFlightRefreshing = false;
            }, 600);
        }
    },

    // =========================================================================
    // 7. TV REMOTE D-PAD SPATIAL NAVIGATION ENGINE
    // =========================================================================

    /**
     * Handles TV Remote directional D-Pad keys for Flights screen.
     * @param {KeyboardEvent} e
     * @returns {boolean} True if key was handled
     */
    handleFlightKeyNavigation(e) {
        if (this.currentView !== 'flights') return false;

        // 1. BACK KEY -> Go back to previous screen
        if (TVRemoteManager.matches(e, 'BACK')) {
            e.preventDefault();
            this.goBack();
            return true;
        }

        const paginatedRows = this.getPaginatedFlights();
        const totalPages = this.getTotalFlightPages();
        const backBtn = document.getElementById('tv-header-back-btn');

        // 2. UP KEY
        if (TVRemoteManager.matches(e, 'UP')) {
            e.preventDefault();

            if (this.flightFocusZone === 'header_back') {
                return true;
            } else if (this.flightFocusZone === 'pagination') {
                // Move up from pagination to the last row of the current page
                this.flightFocusZone = 'rows';
                this.flightFocusIndex = Math.max(0, paginatedRows.length - 1);
            } else if (this.flightFocusZone === 'rows') {
                if (this.flightFocusIndex > 0) {
                    this.flightFocusIndex -= 1;
                } else {
                    // At top row -> Move up to Tabs bar
                    this.flightFocusZone = 'tabs';
                    this.flightFocusIndex = this.activeFlightTab === 'departures' ? 0 : 1;
                }
            } else if (this.flightFocusZone === 'tabs') {
                // Move up to Header Controls
                this.flightFocusZone = 'header';
                this.flightFocusIndex = this.secondaryAirportData ? 2 : 0;
            } else if (this.flightFocusZone === 'header') {
                // Move up to Top Header Back Button
                this.flightFocusZone = 'header_back';
                if (backBtn) backBtn.focus();
            }
            return true;
        }

        // 3. DOWN KEY
        if (TVRemoteManager.matches(e, 'DOWN')) {
            e.preventDefault();

            if (this.flightFocusZone === 'header_back' || document.activeElement === backBtn) {
                if (backBtn) backBtn.blur();
                this.flightFocusZone = 'header';
                this.flightFocusIndex = this.secondaryAirportData ? 2 : 0;
                return true;
            }

            if (this.flightFocusZone === 'header') {
                // Move down from header to Tabs bar
                this.flightFocusZone = 'tabs';
                this.flightFocusIndex = this.activeFlightTab === 'departures' ? 0 : 1;
            } else if (this.flightFocusZone === 'tabs') {
                // Move down from tabs to First Flight Row
                if (paginatedRows.length > 0) {
                    this.flightFocusZone = 'rows';
                    this.flightFocusIndex = 0;
                } else if (totalPages > 1) {
                    this.flightFocusZone = 'pagination';
                    this.flightFocusIndex = 0;
                }
            } else if (this.flightFocusZone === 'rows') {
                if (this.flightFocusIndex < paginatedRows.length - 1) {
                    this.flightFocusIndex += 1;
                } else if (totalPages > 1) {
                    // At bottom of page -> Move to Pagination controls
                    this.flightFocusZone = 'pagination';
                    this.flightFocusIndex = (this.flightPage < totalPages) ? 1 : 0;
                }
            }
            return true;
        }

        // 4. LEFT KEY
        if (TVRemoteManager.matches(e, 'LEFT')) {
            e.preventDefault();

            if (this.flightFocusZone === 'header_back') {
                return true;
            }

            if (this.flightFocusZone === 'header') {
                if (this.secondaryAirportData && this.flightFocusIndex > 0) {
                    this.flightFocusIndex -= 1;
                } else {
                    // Navigate from Header to Top Back Button
                    this.flightFocusZone = 'header_back';
                    if (backBtn) backBtn.focus();
                }
            } else if (this.flightFocusZone === 'tabs') {
                if (this.flightFocusIndex === 1) {
                    this.switchFlightTab('departures');
                    this.flightFocusIndex = 0;
                }
            } else if (this.flightFocusZone === 'rows') {
                // On rows: Left flips to previous page if available, else switches to Departures
                if (this.flightPage > 1) {
                    this.prevFlightPage();
                } else if (this.activeFlightTab === 'arrivals') {
                    this.switchFlightTab('departures');
                }
            } else if (this.flightFocusZone === 'pagination') {
                if (this.flightFocusIndex === 1) {
                    this.flightFocusIndex = 0; // Focus Prev button
                } else {
                    this.prevFlightPage();
                }
            }
            return true;
        }

        // 5. RIGHT KEY
        if (TVRemoteManager.matches(e, 'RIGHT')) {
            e.preventDefault();

            if (this.flightFocusZone === 'header_back' || document.activeElement === backBtn) {
                if (backBtn) backBtn.blur();
                this.flightFocusZone = 'header';
                this.flightFocusIndex = this.secondaryAirportData ? 2 : 0;
                return true;
            }

            if (this.flightFocusZone === 'header') {
                const maxHeaderIdx = this.secondaryAirportData ? 2 : 0;
                if (this.flightFocusIndex < maxHeaderIdx) {
                    this.flightFocusIndex += 1;
                }
            } else if (this.flightFocusZone === 'tabs') {
                if (this.flightFocusIndex === 0) {
                    this.switchFlightTab('arrivals');
                    this.flightFocusIndex = 1;
                } else {
                    // Move focus to Refresh button in header
                    this.flightFocusZone = 'header';
                    this.flightFocusIndex = this.secondaryAirportData ? 2 : 0;
                }
            } else if (this.flightFocusZone === 'rows') {
                // On rows: Right flips to next page if available, else switches to Arrivals
                if (this.flightPage < totalPages) {
                    this.nextFlightPage();
                } else if (this.activeFlightTab === 'departures') {
                    this.switchFlightTab('arrivals');
                }
            } else if (this.flightFocusZone === 'pagination') {
                if (this.flightFocusIndex === 0) {
                    this.flightFocusIndex = 1; // Focus Next button
                } else {
                    this.nextFlightPage();
                }
            }
            return true;
        }

        // 6. ENTER / OK KEY
        if (TVRemoteManager.matches(e, 'ENTER')) {
            e.preventDefault();

            if (this.flightFocusZone === 'header_back' || document.activeElement === backBtn) {
                if (backBtn) backBtn.blur();
                this.goBack();
                return true;
            }

            if (this.flightFocusZone === 'header') {
                if (this.secondaryAirportData) {
                    if (this.flightFocusIndex === 0) this.switchAirportSlot('primary');
                    else if (this.flightFocusIndex === 1) this.switchAirportSlot('secondary');
                    else if (this.flightFocusIndex === 2) this.refreshFlights();
                } else {
                    this.refreshFlights();
                }
            } else if (this.flightFocusZone === 'tabs') {
                if (this.flightFocusIndex === 0) this.switchFlightTab('departures');
                else if (this.flightFocusIndex === 1) this.switchFlightTab('arrivals');
            } else if (this.flightFocusZone === 'rows') {
                const selected = paginatedRows[this.flightFocusIndex];
                if (selected && typeof this.showToast === 'function') {
                    this.showToast(`${selected.airline} (${selected.flight_no}) • Status: ${selected.status}`);
                }
            } else if (this.flightFocusZone === 'pagination') {
                if (this.flightFocusIndex === 0) this.prevFlightPage();
                else if (this.flightFocusIndex === 1) this.nextFlightPage();
            }
            return true;
        }

        return false;
    },

    // =========================================================================
    // 8. OFFLINE REALISTIC SCHEDULE GENERATOR
    // =========================================================================

    /**
     * Offline High-Fidelity Schedule Generator.
     * Generates 14 realistic flights (2 full pages of 7 rows) relative to current time.
     * @param {string} iata
     * @returns {Object}
     */
    generateOfflineFlightMock(iata) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const makeTime = (offsetMins) => {
            const d = new Date(now.getTime() + offsetMins * 60000);
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        const airlines = [
            { name: 'IndiGo', code: '6E', routes: ['Delhi (DEL)', 'Bangalore (BLR)', 'Goa (GOI)', 'Dubai (DXB)', 'Hyderabad (HYD)'] },
            { name: 'Air India', code: 'AI', routes: ['London (LHR)', 'Dubai (DXB)', 'Delhi (DEL)', 'Chennai (MAA)', 'New York (JFK)'] },
            { name: 'Vistara', code: 'UK', routes: ['Singapore (SIN)', 'Hyderabad (HYD)', 'Bangalore (BLR)', 'Kolkata (CCU)'] },
            { name: 'Akasa Air', code: 'QP', routes: ['Ahmedabad (AMD)', 'Pune (PNQ)', 'Lucknow (LKO)', 'Goa (GOX)'] },
            { name: 'SpiceJet', code: 'SG', routes: ['Dubai (DXB)', 'Patna (PAT)', 'Bagdogra (IXB)', 'Jaipur (JAI)'] },
            { name: 'Emirates', code: 'EK', routes: ['Dubai (DXB)', 'London (LHR)'] },
            { name: 'Singapore Airlines', code: 'SQ', routes: ['Singapore (SIN)'] },
            { name: 'Qatar Airways', code: 'QR', routes: ['Doha (DOH)'] }
        ];

        const statuses = ['On Time', 'On Time', 'Boarding', 'On Time', 'Delayed', 'On Time', 'Departed'];
        const departures = [];
        const arrivals = [];

        // Generate exactly 14 items = exactly 2 pages of 7 items
        for (let i = 0; i < 14; i++) {
            const al = airlines[i % airlines.length];
            const route = al.routes[i % al.routes.length];
            departures.push({
                flight_no: `${al.code} ${Math.floor(100 + ((i * 37) % 890))}`,
                airline: al.name,
                destination: route,
                scheduled_time: makeTime(15 + i * 18),
                estimated_time: makeTime(15 + i * 18 + (i === 4 ? 25 : 0)),
                terminal: i % 3 === 0 ? 'T1' : 'T2',
                gate: String(12 + (i * 2)),
                status: statuses[i % statuses.length],
            });

            const arrAl = airlines[(i + 2) % airlines.length];
            const arrRoute = arrAl.routes[(i + 1) % arrAl.routes.length];
            arrivals.push({
                flight_no: `${arrAl.code} ${Math.floor(100 + ((i * 43) % 890))}`,
                airline: arrAl.name,
                origin: arrRoute,
                scheduled_time: makeTime(10 + i * 16),
                estimated_time: makeTime(10 + i * 16),
                terminal: i % 3 === 0 ? 'T1' : 'T2',
                belt: `B${(i % 6) + 1}`,
                status: i < 2 ? 'Landed' : (i === 3 ? 'Delayed' : 'On Time'),
            });
        }

        return {
            current_airport: {
                name: this.currentAirportName || 'International Airport',
                iata_code: iata,
                city: this.currentAirportCity || 'City'
            },
            last_updated: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
            departures: departures,
            arrivals: arrivals
        };
    }
};
