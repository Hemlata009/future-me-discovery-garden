import type { ParentLanguage } from "@/lib/parent-experience";

/** One calm trust line shown on the decision card and the parent page. */
export const honestyNote: Record<ParentLanguage, string> = {
  english:
    "A student-built concept. Not an official NIAT page. Confirm all details with a NIAT counsellor.",
  hindi:
    "छात्र द्वारा बनाया गया एक कॉन्सेप्ट। यह NIAT का आधिकारिक पेज नहीं है। सभी जानकारी की पुष्टि NIAT काउंसलर से करें।",
  telugu:
    "విద్యార్థి రూపొందించిన ఒక కాన్సెప్ట్. ఇది అధికారిక NIAT పేజీ కాదు. అన్ని వివరాలను NIAT కౌన్సెలర్‌తో నిర్ధారించుకోండి.",
};

export const inviteMessage: Record<ParentLanguage, string> = {
  english: "Explore tech with me - takes 5 minutes",
  hindi: "मेरे साथ टेक एक्सप्लोर करो - सिर्फ़ 5 मिनट",
  telugu: "నాతో కలిసి టెక్‌ని అన్వేషించు - కేవలం 5 నిమిషాలు",
};

const shareIntro: Record<ParentLanguage, string> = {
  english: "I explored what I could build in tech. Please read this one-page brief:",
  hindi: "मैंने देखा कि मैं टेक में क्या बना सकता/सकती हूँ। कृपया यह एक पेज का ब्रीफ़ पढ़ें:",
  telugu: "టెక్‌లో నేను ఏమి నిర్మించగలనో అన్వేషించాను. దయచేసి ఈ ఒక పేజీ బ్రీఫ్ చదవండి:",
};

/** Student-to-parent share text; deliberately personal, never worded as an official NIAT message. */
export function parentShareMessage(language: ParentLanguage, url: string): string {
  return `${shareIntro[language]} ${url}`;
}

export const parentLanguageOptions = [
  { value: "english", label: "English" },
  { value: "hindi", label: "हिन्दी" },
  { value: "telugu", label: "తెలుగు" },
] as const;

export function toParentLanguage(value: string | undefined): ParentLanguage {
  return value === "hindi" || value === "telugu" ? value : "english";
}
