'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

const COUNTRIES: Country[] = [
  // Southeast Asia (sorted: Indonesia first)
  { code: 'ID', name: 'Indonesia', dialCode: '62', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', dialCode: '60', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', dialCode: '65', flag: '🇸🇬' },
  { code: 'TH', name: 'Thailand', dialCode: '66', flag: '🇹🇭' },
  { code: 'PH', name: 'Philippines', dialCode: '63', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', dialCode: '84', flag: '🇻🇳' },
  { code: 'MM', name: 'Myanmar', dialCode: '95', flag: '🇲🇲' },
  { code: 'KH', name: 'Cambodia', dialCode: '855', flag: '🇰🇭' },
  { code: 'LA', name: 'Laos', dialCode: '856', flag: '🇱🇦' },
  { code: 'BN', name: 'Brunei', dialCode: '673', flag: '🇧🇳' },
  { code: 'TL', name: 'Timor-Leste', dialCode: '670', flag: '🇹🇱' },
  // East Asia
  { code: 'CN', name: 'China', dialCode: '86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dialCode: '81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dialCode: '82', flag: '🇰🇷' },
  { code: 'TW', name: 'Taiwan', dialCode: '886', flag: '🇹🇼' },
  { code: 'HK', name: 'Hong Kong', dialCode: '852', flag: '🇭🇰' },
  { code: 'MO', name: 'Macau', dialCode: '853', flag: '🇲🇴' },
  // South Asia
  { code: 'IN', name: 'India', dialCode: '91', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', dialCode: '92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dialCode: '880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '94', flag: '🇱🇰' },
  { code: 'NP', name: 'Nepal', dialCode: '977', flag: '🇳🇵' },
  // Middle East
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966', flag: '🇸🇦' },
  { code: 'AE', name: 'UAE', dialCode: '971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar', dialCode: '974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait', dialCode: '965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain', dialCode: '973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman', dialCode: '968', flag: '🇴🇲' },
  { code: 'TR', name: 'Turkey', dialCode: '90', flag: '🇹🇷' },
  { code: 'IL', name: 'Israel', dialCode: '972', flag: '🇮🇱' },
  { code: 'JO', name: 'Jordan', dialCode: '962', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon', dialCode: '961', flag: '🇱🇧' },
  { code: 'IQ', name: 'Iraq', dialCode: '964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran', dialCode: '98', flag: '🇮🇷' },
  // Europe
  { code: 'GB', name: 'United Kingdom', dialCode: '44', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', dialCode: '49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '33', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', dialCode: '39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dialCode: '34', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', dialCode: '31', flag: '🇳🇱' },
  { code: 'RU', name: 'Russia', dialCode: '7', flag: '🇷🇺' },
  { code: 'PL', name: 'Poland', dialCode: '48', flag: '🇵🇱' },
  { code: 'UA', name: 'Ukraine', dialCode: '380', flag: '🇺🇦' },
  { code: 'SE', name: 'Sweden', dialCode: '46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dialCode: '47', flag: '🇳🇴' },
  { code: 'CH', name: 'Switzerland', dialCode: '41', flag: '🇨🇭' },
  { code: 'PT', name: 'Portugal', dialCode: '351', flag: '🇵🇹' },
  { code: 'GR', name: 'Greece', dialCode: '30', flag: '🇬🇷' },
  { code: 'BE', name: 'Belgium', dialCode: '32', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', dialCode: '43', flag: '🇦🇹' },
  { code: 'DK', name: 'Denmark', dialCode: '45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', dialCode: '358', flag: '🇫🇮' },
  { code: 'IE', name: 'Ireland', dialCode: '353', flag: '🇮🇪' },
  // Americas
  { code: 'US', name: 'United States', dialCode: '1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', dialCode: '1', flag: '🇨🇦' },
  { code: 'BR', name: 'Brazil', dialCode: '55', flag: '🇧🇷' },
  { code: 'AR', name: 'Argentina', dialCode: '54', flag: '🇦🇷' },
  { code: 'MX', name: 'Mexico', dialCode: '52', flag: '🇲🇽' },
  { code: 'CO', name: 'Colombia', dialCode: '57', flag: '🇨🇴' },
  { code: 'CL', name: 'Chile', dialCode: '56', flag: '🇨🇱' },
  { code: 'PE', name: 'Peru', dialCode: '51', flag: '🇵🇪' },
  // Africa
  { code: 'ZA', name: 'South Africa', dialCode: '27', flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria', dialCode: '234', flag: '🇳🇬' },
  { code: 'EG', name: 'Egypt', dialCode: '20', flag: '🇪🇬' },
  { code: 'KE', name: 'Kenya', dialCode: '254', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana', dialCode: '233', flag: '🇬🇭' },
  { code: 'TZ', name: 'Tanzania', dialCode: '255', flag: '🇹🇿' },
  { code: 'MA', name: 'Morocco', dialCode: '212', flag: '🇲🇦' },
  // Oceania
  { code: 'AU', name: 'Australia', dialCode: '61', flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand', dialCode: '64', flag: '🇳🇿' },
];

interface CountryCodeSelectorProps {
  value: string; // dialCode like "62"
  onChange: (dialCode: string) => void;
  className?: string;
}

export default function CountryCodeSelector({ value, onChange, className = '' }: CountryCodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find((c) => c.dialCode === value) || COUNTRIES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dialCode.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex items-center gap-1 h-12 px-3 bg-input/50 border border-border/50 rounded-xl text-foreground text-sm font-medium hover:bg-input/70 transition-colors whitespace-nowrap focus:border-[#D4AF37]/50"
      >
        <span className="text-base">{selected.flag}</span>
        <span className="text-muted-foreground">+{selected.dialCode}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-[min(18rem,calc(100vw-2rem))] max-h-80 overflow-hidden glass-strong border border-border/50 rounded-xl z-50 shadow-xl shadow-black/30 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full h-8 pl-8 pr-3 bg-input/30 border border-border/30 rounded-lg text-foreground text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#D4AF37]/50"
              />
            </div>
          </div>

          {/* Country List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs">No countries found</div>
            ) : (
              filtered.map((country) => (
                <button
                  key={country.code + country.dialCode}
                  type="button"
                  onClick={() => {
                    onChange(country.dialCode);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5 transition-colors ${
                    country.dialCode === value ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'text-foreground'
                  }`}
                >
                  <span className="text-base w-6 text-center">{country.flag}</span>
                  <span className="flex-1 text-left text-xs truncate">{country.name}</span>
                  <span className="text-xs text-muted-foreground">+{country.dialCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { COUNTRIES };
export type { Country };
