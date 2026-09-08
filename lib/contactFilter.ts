/**
 * Contact Information Filter for BYLLD X
 * Prevents sharing of phone numbers, email addresses, and social media handles
 * to ensure privacy and prevent platform disintermediation.
 */

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

// Phone number regex pattern (handles Indian 10-digit, +91, spaced or hyphenated numbers)
const PHONE_REGEX = /(?:(?:\+|00)?91[\s.-]?)?(?:[6-9]\d{4}[\s.-]?\d{5}|[6-9]\d{9}|\b\d{5}[\s.-]\d{5}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/;

// Social media URLs and platforms
const SOCIAL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|linkedin\.com|twitter\.com|x\.com|t\.me|telegram\.me|telegram\.dog|wa\.me|api\.whatsapp\.com|snapchat\.com|tiktok\.com|threads\.net)\/[^\s]+/i;

// Keywords indicating off-platform contact sharing
const CONTACT_KEYWORDS_REGEX = /\b(?:whatsapp|insta|instagram|telegram|dm me on|call me at|ping me on|reach me at|text me at)\s*[:@-]?\s*[\w\d+.-]+/i;

export interface ContactDetectionResult {
  hasContactInfo: boolean;
  reason?: string;
}

export function detectContactInfo(text: string): ContactDetectionResult {
  if (!text) return { hasContactInfo: false };

  if (EMAIL_REGEX.test(text)) {
    return {
      hasContactInfo: true,
      reason: "Sharing email addresses is not permitted. Please communicate via BYLLD X messaging.",
    };
  }

  if (PHONE_REGEX.test(text)) {
    return {
      hasContactInfo: true,
      reason: "Sharing phone numbers is not permitted. Please communicate via BYLLD X messaging.",
    };
  }

  if (SOCIAL_REGEX.test(text)) {
    return {
      hasContactInfo: true,
      reason: "External social media links (Instagram, LinkedIn, Telegram, WhatsApp, etc.) cannot be shared.",
    };
  }

  if (CONTACT_KEYWORDS_REGEX.test(text)) {
    return {
      hasContactInfo: true,
      reason: "Direct contact handles (WhatsApp, Telegram, Instagram, etc.) cannot be shared.",
    };
  }

  return { hasContactInfo: false };
}

/**
 * Strips or redacts any accidental contact details from public bios/descriptions.
 */
export function sanitizePublicText(text: string): string {
  if (!text) return "";
  let sanitized = text;
  sanitized = sanitized.replace(EMAIL_REGEX, "[contact hidden]");
  sanitized = sanitized.replace(PHONE_REGEX, "[contact hidden]");
  sanitized = sanitized.replace(SOCIAL_REGEX, "[link hidden]");
  return sanitized;
}
