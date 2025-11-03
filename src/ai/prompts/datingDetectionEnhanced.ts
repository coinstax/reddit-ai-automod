/**
 * AI Automod - AI Automod for Reddit
 * Copyright (C) 2025 CoinsTax LLC
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Enhanced Dating Detection Prompt System
 *
 * High-precision prompt for detecting actual dating/romantic solicitation
 * while minimizing false positives from discussions about dating.
 *
 * @module ai/prompts/datingDetectionEnhanced
 */

import { AIQuestion } from '../../types/ai.js';

/**
 * Enhanced dating detection prompt with chain-of-thought reasoning
 * and false positive filters
 */
export const DATING_DETECTION_ENHANCED_PROMPT = `You are a high-precision content classifier specializing in detecting ACTUAL dating/romantic/sexual solicitation in online communities.

CRITICAL CONTEXT:
You are analyzing posts in r/{subreddit}, a FRIENDSHIP community that explicitly prohibits dating/romantic content. Many users discuss dating as a topic or quote rules - this is NOT solicitation.

USER PROFILE:
- Username: {username}
- Account age: {accountAge} days
- Total karma: {totalKarma}
- Email verified: {emailVerified}

POST HISTORY ANALYSIS:
Review the last 100 posts/comments for patterns:
{postHistory}

CURRENT POST:
Title: {title}
Body: {body}

CLASSIFICATION FRAMEWORK:

STEP 1 - Evidence Collection:
Identify and quote exact phrases that could indicate dating intent. For each quote, categorize as:
- DIRECT: Explicit solicitation ("looking for a girlfriend", "seeking romance", "want to date")
- IMPLIED: Suggestive but ambiguous ("open to whatever happens", "see where it goes")
- CONTEXTUAL: Requires interpretation ("feeling lonely", "miss having someone")
- DISCUSSION: Talking ABOUT dating, not seeking it ("dating apps suck", "when I was dating")
- NEGATED: Explicitly NOT seeking ("not looking for dates", "just friends only")

STEP 2 - Intent Analysis:
For each piece of evidence, determine:
- PERSON: First person (I/me) vs Third person (they/people)
- TENSE: Present intent vs Past experience
- PURPOSE: Seeking connection vs Sharing experience/opinion
- AUDIENCE: Addressing potential matches vs General discussion

STEP 3 - False Positive Filters:
Check for these common false positive patterns:
□ Quoting or referencing subreddit rules about no dating
□ Telling stories about past dating experiences
□ Giving advice to others about dating
□ Complaining about dating on the subreddit
□ Discussing dating as a general topic
□ Using "date" to mean calendar date
□ Negated statements ("NOT looking for dates")
□ Conditional statements ("IF you want to date, go elsewhere")
□ Sarcasm or humor about dating
□ Mentions being happily married/partnered

STEP 4 - Confidence Calibration:
- 90-100%: Multiple DIRECT indicators, clear intent, no false positive patterns
- 70-89%: Mix of DIRECT and IMPLIED indicators, intent is likely
- 50-69%: Mostly IMPLIED/CONTEXTUAL, ambiguous intent
- 30-49%: Weak evidence, multiple false positive patterns present
- 0-29%: Clear false positive, discussing but not seeking

REQUIRED OUTPUT FORMAT:
{
  "classification": {
    "is_soliciting": boolean,
    "confidence": number (0-100),
    "primary_evidence": "exact quote that best supports decision",
    "evidence_type": "DIRECT|IMPLIED|CONTEXTUAL|DISCUSSION|NEGATED"
  },
  "evidence_analysis": {
    "direct_indicators": ["quote1", "quote2"],
    "implied_indicators": ["quote3"],
    "contextual_indicators": ["quote4"],
    "false_positive_patterns": ["pattern detected"],
    "negating_factors": ["factor1", "factor2"]
  },
  "linguistic_analysis": {
    "person": "first|third|mixed",
    "tense": "present|past|future|mixed",
    "purpose": "seeking|discussing|advising|complaining",
    "has_negation": boolean,
    "has_conditionals": boolean
  },
  "reasoning": "2-3 sentences explaining the classification decision",
  "action_recommendation": "APPROVE|MONITOR|FLAG|REMOVE"
}

ACTION GUIDELINES:
- APPROVE: Confidence < 50% OR clear false positive patterns
- MONITOR: Confidence 50-69%, ambiguous intent
- FLAG: Confidence 70-89%, likely solicitation for human review
- REMOVE: Confidence 90%+, clear solicitation with direct evidence`;

/**
 * Few-shot examples for enhanced dating detection
 */
export const DATING_DETECTION_EXAMPLES = [
  {
    title: "45M seeking female friends",
    body: "Single guy here, looking to connect with women 35-50. I'm romantic, love long walks, and deep conversations. DM me if interested!",
    expected: {
      is_soliciting: true,
      confidence: 95,
      evidence: ["seeking female friends", "Single guy", "looking to connect with women 35-50", "DM me if interested"],
      reasoning: "Multiple direct indicators of romantic intent, gender preference stated, requesting private contact."
    }
  },
  {
    title: "Why is dating banned here?",
    body: "I keep seeing people trying to date in this sub. Don't they know the rules say 'no dating or romantic solicitation'? It's annoying when you just want platonic friends.",
    expected: {
      is_soliciting: false,
      confidence: 10,
      evidence: ["rules say 'no dating or romantic solicitation'", "just want platonic friends"],
      reasoning: "User is discussing the dating ban and criticizing others who violate it, not seeking dates themselves."
    }
  },
  {
    title: "Finally comfortable being single",
    body: "After my divorce 2 years ago, I tried dating apps but they were awful. Now I'm focused on friendships and hobbies. Much happier!",
    expected: {
      is_soliciting: false,
      confidence: 20,
      evidence: ["tried dating apps", "Now I'm focused on friendships"],
      reasoning: "Sharing past experience and explicitly stating current focus is friendships, not romance."
    }
  },
  {
    title: "New to town, looking to meet people",
    body: "Just moved here, don't know anyone. Open-minded person, love coffee and good conversation. Would enjoy getting to know locals!",
    expected: {
      is_soliciting: false,
      confidence: 55,
      evidence: ["Open-minded", "get to know locals"],
      reasoning: "Ambiguous language that could be platonic or romantic. Needs monitoring but not enough evidence to flag."
    }
  },
  {
    title: "Coffee buddy wanted",
    body: "Looking for someone to explore coffee shops with. I'm 42M, prefer female company as I connect better. Just two people enjoying good coffee and seeing where things go naturally.",
    expected: {
      is_soliciting: true,
      confidence: 75,
      evidence: ["prefer female company", "seeing where things go naturally"],
      reasoning: "Gender preference and open-ended intentions suggest romantic possibility despite surface-level platonic framing."
    }
  }
];

/**
 * Create an AIQuestion for enhanced dating detection
 */
export function createDatingDetectionQuestion(
  context?: string
): AIQuestion {
  return {
    id: 'dating_intent_enhanced',
    question: DATING_DETECTION_ENHANCED_PROMPT,
    context: context || 'Analyze for actual dating solicitation, not discussions about dating'
  };
}

/**
 * Regex patterns for prefiltering before AI analysis
 */
export const DATING_PREFILTER_PATTERNS = {
  // Strong signals (any match → check with AI)
  strong: [
    /\b(looking for|seeking|want to find).{0,20}(woman|women|lady|ladies|female|man|men|male|guy)/i,
    /\b(single|divorced|widowed|separated).{0,20}(looking|seeking|ready|available)/i,
    /\bDM me if.{0,30}interested\b/i,
    /\bopen to.{0,20}(romance|romantic|relationship|dating|love)/i,
    /\b(chemistry|spark|connection|vibe).{0,20}(between us|with someone)/i,
  ],

  // Moderate signals (need 2+ matches → check with AI)
  moderate: [
    /\b(prefer|looking for).{0,20}(female|male|women|men)/i,
    /\bsingle (m|f|male|female|man|woman)\b/i,
    /\b(attractive|handsome|beautiful|cute|sexy)\b/i,
    /\b(coffee|drinks?|dinner|lunch).{0,20}(together|with me|date)/i,
    /\bget to know.{0,20}(you|each other|someone)/i,
  ],

  // Exclusion patterns (skip AI if only these exist)
  exclude: [
    /\b(not|never|don't|doesn't|won't|no).{0,20}(looking for|seeking|want).{0,20}(dates?|romance|relationship)/i,
    /\brules?.{0,30}(say|state|prohibit|ban).{0,30}dating/i,
    /\b(husband|wife|partner|spouse|married).{0,20}(and I|loves|supports)/i,
    /\bplatonic.{0,20}(friends|friendship|only)/i,
  ]
};

/**
 * Check if text should be analyzed for dating intent
 */
export function shouldAnalyzeForDating(title: string, body: string): boolean {
  const combined = `${title} ${body}`.toLowerCase();

  // Check exclusions first
  if (DATING_PREFILTER_PATTERNS.exclude.some(pattern => pattern.test(combined))) {
    return false; // Skip AI analysis
  }

  // Check strong signals
  if (DATING_PREFILTER_PATTERNS.strong.some(pattern => pattern.test(combined))) {
    return true; // Analyze with AI
  }

  // Check moderate signals (need 2+)
  const moderateMatches = DATING_PREFILTER_PATTERNS.moderate.filter(pattern =>
    pattern.test(combined)
  ).length;

  return moderateMatches >= 2;
}

/**
 * Validate and potentially override AI decision based on clear patterns
 */
export function validateDatingDetection(
  aiResult: any,
  title: string,
  body: string,
  authorIsMod: boolean
): any {
  const text = `${title} ${body}`.toLowerCase();

  // Override AI if clear false positive patterns
  if (aiResult.classification?.is_soliciting) {
    // Strong negation should override AI
    if (/\bnot looking for.{0,10}(dates?|romance|relationship)/i.test(text)) {
      return {
        ...aiResult,
        classification: {
          ...aiResult.classification,
          is_soliciting: false,
          confidence: Math.min(30, aiResult.classification.confidence),
          override_reason: "Strong negation pattern detected"
        }
      };
    }

    // Mod/admin discussing rules should never be flagged
    if (authorIsMod && text.includes('dating') && text.includes('rule')) {
      return {
        ...aiResult,
        classification: {
          ...aiResult.classification,
          is_soliciting: false,
          confidence: 0,
          override_reason: "Moderator discussing rules"
        }
      };
    }
  }

  return aiResult;
}

/**
 * Threshold configuration for dating detection
 */
export const DATING_DETECTION_THRESHOLDS = {
  // Action thresholds
  autoRemove: 90,      // Only the clearest cases
  autoFlag: 70,        // Likely violations for review
  monitor: 50,         // Ambiguous, track patterns
  approve: 0,          // Below 50% = approve

  // Evidence requirements
  minEvidencePieces: {
    autoRemove: 3,     // Need 3+ pieces of direct evidence
    autoFlag: 2,       // Need 2+ pieces of evidence (direct or implied)
    monitor: 1         // Need at least 1 piece of evidence
  },

  // Confidence adjustments based on user history
  historyAdjustments: {
    previousViolation: 10,    // Increase confidence if prior violations
    trustedUser: -20,         // Decrease confidence for established users
    modApproved: -30,         // Decrease confidence for approved users
    newAccount: 5             // Slight increase for brand new accounts
  }
};

/**
 * Aggregate multiple dating detection analyses
 */
export function aggregateDatingAnalyses(analyses: any[]): string {
  if (!analyses || analyses.length === 0) {
    return 'APPROVE';
  }

  // Weight recent posts more heavily (exponential decay)
  const weights = analyses.map((_, i) => Math.exp(-i * 0.1));

  // Calculate weighted confidence
  const weightedConfidence = analyses.reduce((sum, analysis, i) => {
    const confidence = analysis.classification?.confidence || 0;
    return sum + (confidence * weights[i]);
  }, 0) / weights.reduce((a, b) => a + b, 0);

  // Count strong evidence across all posts
  const strongEvidenceCount = analyses.filter(a =>
    a.evidence_analysis?.direct_indicators?.length > 0
  ).length;

  // Decision logic
  if (strongEvidenceCount >= 2 || weightedConfidence >= 85) {
    return 'FLAG';
  } else if (strongEvidenceCount >= 1 || weightedConfidence >= 60) {
    return 'MONITOR';
  } else {
    return 'APPROVE';
  }
}