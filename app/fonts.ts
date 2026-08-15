import {
  Archivo,
  DM_Sans,
  Inter,
  Inter_Tight,
  JetBrains_Mono,
  Manrope,
  Montserrat,
  Oswald,
  Playfair_Display,
  Poppins,
  Roboto,
  Source_Serif_4,
  Space_Grotesk,
} from "next/font/google";

// Every family in the whitelist is loaded, because generated documents reference
// them by name and a missing face means the design silently renders in a fallback.
// Subsets are inlined rather than shared: next/font types each family's subset list
// separately and rejects a shared readonly array.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
export const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});
export const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
export const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto" });
export const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
export const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
export const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
export const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
});
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif-4",
});
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const fontVariables = [
  inter,
  interTight,
  archivo,
  manrope,
  poppins,
  montserrat,
  roboto,
  oswald,
  spaceGrotesk,
  dmSans,
  playfair,
  sourceSerif,
  jetbrainsMono,
]
  .map((font) => font.variable)
  .join(" ");
