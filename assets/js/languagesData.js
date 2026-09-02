/**
 * Supported Languages Repository (languagesData.js)
 * Standalone list of 21 offline-supported languages and RTL detection.
 */
'use strict';

const AVAILABLE_LANGUAGES = [
    { name: "English", file: "english.json", code: "EN" },
    { name: "हिंदी", file: "hindi.json", code: "HI" },
    { name: "मराठी", file: "marathi.json", code: "MR" },
    { name: "कोंकणी", file: "konkani.json", code: "GOM" },
    { name: "ગુજરાતી", file: "gujrati.json", code: "GU" },
    { name: "বাংলা", file: "bengali.json", code: "BN" },
    { name: "ਪੰਜਾਬੀ", file: "punjabi.json", code: "PA" },
    { name: "অসমীয়া", file: "assamese.json", code: "AS" },
    { name: "ಕನ್ನಡ", file: "kannada.json", code: "KN" },
    { name: "தமிழ்", file: "tamil.json", code: "TA" },
    { name: "తెలుగు", file: "telugu.json", code: "TE" },
    { name: "മലയാളം", file: "malayalam.json", code: "ML" },
    { name: "Français", file: "french.json", code: "FR" },
    { name: "Deutsch", file: "german.json", code: "DE" },
    { name: "Español", file: "spanish.json", code: "ES" },
    { name: "Português", file: "portuguese.json", code: "PT" },
    { name: "Русский", file: "russian.json", code: "RU" },
    { name: "简体中文", file: "chinese.json", code: "ZH" },
    { name: "עִברִית", file: "hebrew.json", code: "HE" },
    { name: "اردو", file: "urdu.json", code: "UR" },
    { name: "عربي", file: "arabic.json", code: "AR" }
];

const RTL_LANG_FILES = ['arabic.json', 'urdu.json', 'hebrew.json'];

window.AVAILABLE_LANGUAGES = AVAILABLE_LANGUAGES;
window.RTL_LANG_FILES = RTL_LANG_FILES;
