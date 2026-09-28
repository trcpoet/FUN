/**
 * FUN's legal documents: Terms, Privacy Policy, Community Guidelines and the Child
 * Safety Standards page.
 *
 * DRAFTS, pending review by counsel. They describe the product as it launches,
 * including safety tools that ship in later phases. Fill `COMPANY` before launch;
 * nothing else in the text needs editing to do that.
 *
 * `LEGAL_VERSION` is what a person accepts. It must equal `current_version` in the
 * `legal_documents` table; bump both together and every member is asked to accept
 * again. The server refuses an acceptance of any other version.
 */

export const LEGAL_VERSION = "2026-09-28";

export const COMPANY = {
  name: "[COMPANY NAME]",
  address: "[REGISTERED ADDRESS]",
  email: "[LEGAL EMAIL]",
  governingLaw: "[GOVERNING LAW / JURISDICTION]",
  euRepresentative: "[EU/UK REPRESENTATIVE, if required]",
} as const;

export type AcceptedDocument = "terms" | "privacy" | "guidelines";

/** What the sign-up and setup forms send: the version of each document on screen. */
export function acceptedDocumentsPayload(): Record<AcceptedDocument, string> {
  return { terms: LEGAL_VERSION, privacy: LEGAL_VERSION, guidelines: LEGAL_VERSION };
}

export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };
export type LegalDocument = {
  slug: "terms" | "privacy" | "guidelines" | "child-safety";
  title: string;
  summary: string;
  sections: LegalSection[];
};

const C = COMPANY;

const TERMS: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary:
    "The agreement between you and FUN: who can use it, how the two age groups work, and the risks of playing sport with people you meet here.",
  sections: [
    {
      heading: "1. Who we are",
      paragraphs: [
        `FUN is operated by ${C.name}, ${C.address} ("FUN", "we", "us"). By creating an account you agree to these Terms, our Privacy Policy and our Community Guidelines. If you do not agree, do not create an account. You can still browse the map as a guest.`,
      ],
    },
    {
      heading: "2. Who can use FUN",
      bullets: [
        "You must be at least 13, or older where the law of your country sets a higher minimum (for example 16 in Australia and in some EU countries). The sign-up form applies the minimum for the country you choose.",
        "FUN has two separate communities: players under 18, and players 18 and over. You belong to the one that matches your real date of birth. Games, chat, messages, follows and profiles never cross between them.",
        "You must give your real date of birth and country. Giving a false one, or creating an account to reach the other age group, breaks these Terms and we will close the account.",
        "Players under 18 must complete an age check before joining games, chatting or messaging. If you are under 18, a parent or guardian should know you use FUN and agree to these Terms with you.",
        "You may not use FUN if we have previously removed you, or if you are prohibited from doing so by law.",
      ],
    },
    {
      heading: "3. Your account",
      bullets: [
        "One person, one account. Keep your password private; you are responsible for activity on your account.",
        "Keep your profile honest. Photos must be of you, and names must not impersonate anyone.",
        "You can delete your account at any time in Settings.",
      ],
    },
    {
      heading: "4. Playing sport in person",
      paragraphs: [
        "FUN helps people find pickup games. We do not organise, supervise, referee or insure games, and we do not check venues, equipment or the people who come. Sport carries a real risk of injury. You take part at your own risk and are responsible for deciding whether a game, a venue and the people there are safe for you.",
      ],
      bullets: [
        "Meet in public places, tell someone where you are going, and leave if something feels wrong.",
        "Venue details come partly from OpenStreetMap and from players, and may be out of date. Follow each venue's rules and do not enter private property.",
        "Check you are fit to play. Nothing on FUN is medical advice.",
      ],
    },
    {
      heading: "5. How you must behave",
      paragraphs: [
        "Follow the Community Guidelines. In short: no harassment, hate, threats or violence; no sexual content; no contact with minors by adults; no scams, spam or selling; no fake accounts; nothing illegal.",
      ],
    },
    {
      heading: "6. Your content",
      paragraphs: [
        "You own what you post. You give FUN a worldwide, non-exclusive, royalty-free licence to host, store, display and distribute it within the service, for as long as it is on FUN and for a reasonable period after for backups and legal needs. Only post what you have the right to post.",
      ],
    },
    {
      heading: "7. Verification and the Verified badge",
      paragraphs: [
        "Age checks and ID verification are carried out by our provider, Persona. A Verified badge means the account passed a check at a point in time. It is not a guarantee of anyone's identity, character or safety, and it does not replace your own judgement.",
      ],
    },
    {
      heading: "8. Reports, moderation and appeals",
      paragraphs: [
        "You can report people and content from inside the app. We may remove content, limit features, or suspend or close accounts that break these Terms or the law, and we will tell you why unless the law or someone's safety prevents it. You can ask us to review a decision by writing to " +
          `${C.email}. We report child sexual exploitation to the relevant authorities.`,
      ],
    },
    {
      heading: "9. Ending your use",
      paragraphs: [
        "You can stop using FUN and delete your account at any time. We may suspend or close an account for serious or repeated breaches, to protect other people, or where the law requires it.",
      ],
    },
    {
      heading: "10. Disclaimers and liability",
      paragraphs: [
        'FUN is provided "as is". To the extent the law allows, we are not liable for injury, loss or damage arising from games, venues or other players, or for indirect or consequential losses. Nothing in these Terms limits liability that cannot be limited by law, such as for death or personal injury caused by our negligence, or removes rights you have as a consumer where you live.',
      ],
    },
    {
      heading: "11. Law and disputes",
      paragraphs: [
        `These Terms are governed by ${C.governingLaw}. If you live in the EU, the UK or another country whose consumer law gives you the right, you may also bring a claim in your home courts and rely on its mandatory protections.`,
      ],
    },
    {
      heading: "12. Changes and contact",
      paragraphs: [
        `We will tell you in the app before changes take effect and ask you to accept them. Questions: ${C.email}.`,
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "What FUN collects, why, who can see it, and how to see, export or delete it. We do not sell your data or use it for advertising.",
  sections: [
    {
      heading: "1. Who is responsible",
      paragraphs: [
        `${C.name}, ${C.address}, is the controller of your personal data. Contact: ${C.email}. EU/UK representative: ${C.euRepresentative}.`,
      ],
    },
    {
      heading: "2. What we collect",
      bullets: [
        "Account: email address and a password (stored only as a secure hash).",
        "Date of birth and country: used only to apply the minimum age and place you in the under-18 or 18+ community. Never shown to anyone else.",
        "Gender: used to show you games you are eligible for (for example women-only games).",
        "Profile: name, photo, sports, skill, availability and anything else you add.",
        "Location: your device location while you use the map, to show games and venues near you. If you choose to appear on the map, other players in your age group see an approximate position.",
        "What you post: games, messages, notes, comments, photos, reviews and ratings.",
        "Verification results: whether you passed an age check or ID check, and the resulting age band. Not the images (see section 8).",
        "Technical: aggregate, cookie-free usage statistics and error reports that do not include your identity.",
      ],
    },
    {
      heading: "3. Why we use it (and our legal bases)",
      bullets: [
        "To run FUN for you: your account, the map, games, chat and your profile (contract).",
        "To keep people safe: age groups, verification, reports, moderation and preventing abuse (legitimate interests and legal obligations).",
        "To show you your location on the map and, if you choose, to show you to others (consent, which you can withdraw in your device settings or Settings).",
        "To improve reliability and fix errors (legitimate interests).",
      ],
    },
    {
      heading: "4. How we recommend games and players",
      paragraphs: [
        "Suggestions are ranked by shared sports, availability, distance, ratings and closeness in age, and only ever within your own age group. You can turn off appearing in suggestions in Settings. We do not use your data for advertising or sell it to anyone.",
      ],
    },
    {
      heading: "5. Who can see what",
      bullets: [
        "Visitors who are not signed in see only what is happening, where and when, and how many are in. Never who. Nothing from the under-18 community is ever shown to them.",
        "Signed-in members see profiles and activity from their own age group only.",
        "Your date of birth, country and email are never shown to other members.",
      ],
    },
    {
      heading: "6. Service providers",
      paragraphs: [
        "We share data only with providers who run FUN for us, under contract: Supabase (database and accounts), Vercel (hosting and privacy-friendly analytics), Mapbox (maps), Persona (age and ID checks) and Sentry (error reports). We may disclose data where the law requires it or to protect someone's safety. Some providers process data outside your country; where needed we rely on Standard Contractual Clauses or equivalent safeguards.",
      ],
    },
    {
      heading: "7. How long we keep it",
      paragraphs: [
        "For as long as your account exists. When you delete it, your profile and content are removed, and remaining copies leave our backups within 30 days. We keep a record of which terms you accepted, and reports needed to protect others, only as long as the law requires or allows.",
      ],
    },
    {
      heading: "8. Age checks, ID and biometric data",
      paragraphs: [
        "Age checks and ID verification are done by Persona. Before you start, we ask for your consent. Persona may analyse a selfie and an identity document to estimate your age or confirm your identity; this can involve biometric data. Persona keeps the images and any biometric data under its own retention schedule and deletes them after the check, and FUN never receives them. We receive only the result.",
      ],
    },
    {
      heading: "9. Your rights",
      paragraphs: [
        `Depending on where you live, you can: access your data, download a copy, correct it, delete it, object to or restrict some uses, and withdraw consent. You can download or delete your data in Settings, or write to ${C.email}. You may also complain to your local data protection authority. California residents: we do not sell or share personal information for cross-context advertising, and we will not treat you differently for using your rights.`,
      ],
    },
    {
      heading: "10. Players under 18",
      bullets: [
        "No one under 13 (or the higher minimum in their country) may have an account.",
        "Under-18 accounts are kept separate from adults, are not shown to visitors who are not signed in, are hidden from suggestions by default, and must pass an age check before interacting.",
        `Parents and guardians can contact ${C.email} about a child's account, including to have it deleted.`,
      ],
    },
    {
      heading: "11. Cookies and storage",
      paragraphs: [
        "FUN does not use advertising or tracking cookies. We store what is needed to keep you signed in and remember your preferences on your device.",
      ],
    },
    {
      heading: "12. Security and changes",
      paragraphs: [
        `We protect data with access controls, encryption in transit and least-privilege database rules. We will tell you in the app about material changes to this policy. Questions: ${C.email}.`,
      ],
    },
  ],
};

const GUIDELINES: LegalDocument = {
  slug: "guidelines",
  title: "Community Guidelines",
  summary: "How to be a good teammate on and off the map.",
  sections: [
    {
      heading: "Play fair, be kind",
      bullets: [
        "Respect everyone at a game, whatever their level, gender, background or ability.",
        "Show up when you say you will, or leave the game so someone else can play.",
        "Rate teammates honestly, on sportsmanship rather than skill.",
      ],
    },
    {
      heading: "Keep it safe",
      bullets: [
        "Meet at public venues. Never pressure anyone to go somewhere private.",
        "No threats, violence, weapons or encouraging dangerous play.",
        "Respect venue rules and private property.",
      ],
    },
    {
      heading: "Never allowed",
      bullets: [
        "Harassment, bullying, hate speech or discrimination.",
        "Sexual content, sexual messages or requests of any kind.",
        "Adults contacting, meeting or trying to reach anyone under 18. Zero tolerance.",
        "Lying about your age, or creating accounts to reach the other age group.",
        "Fake profiles, impersonation or someone else's photos.",
        "Scams, spam, selling, or sending people off FUN to pay for something.",
        "Sharing someone's private information, such as their address or phone number, without consent.",
        "Anything illegal.",
      ],
    },
    {
      heading: "If something is wrong",
      paragraphs: [
        "Report the person or content from its menu, and block anyone you don't want to hear from. If someone is in danger, contact local emergency services first.",
        "We may remove content, restrict features, or suspend or close accounts. Serious breaches, especially anything involving a minor, lead to permanent removal and a report to the authorities.",
      ],
    },
  ],
};

const CHILD_SAFETY: LegalDocument = {
  slug: "child-safety",
  title: "Child Safety Standards",
  summary: "FUN's standards against child sexual abuse and exploitation (CSAE).",
  sections: [
    {
      heading: "Zero tolerance",
      paragraphs: [
        "FUN prohibits child sexual abuse material and any sexualisation, grooming or exploitation of minors. Accounts involved are removed permanently.",
      ],
    },
    {
      heading: "How FUN is built to protect minors",
      bullets: [
        "No accounts under 13, or under the higher legal minimum in the user's country.",
        "Players under 18 and adults are kept in fully separate communities: no shared games, chats, messages, follows or profiles.",
        "Players under 18 must pass an age check before they can interact with anyone.",
        "Under-18 activity is never shown to visitors who are not signed in, and under-18 profiles are hidden from suggestions by default.",
        "In-app reporting and blocking, with reports involving minors reviewed first.",
      ],
    },
    {
      heading: "Reporting and cooperation",
      paragraphs: [
        "Report concerns in the app or by email. We review reports involving minors as a priority, preserve evidence, and report apparent child sexual exploitation to the National Center for Missing & Exploited Children (NCMEC) and to law enforcement or other authorities as required by law.",
      ],
    },
    {
      heading: "Child safety contact",
      paragraphs: [`${C.name}, ${C.email}.`],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocument["slug"], LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  guidelines: GUIDELINES,
  "child-safety": CHILD_SAFETY,
};
