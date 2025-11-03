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
 * Tests for Enhanced AI Question field validation
 *
 * Tests that the schema validator correctly validates enhanced AI question fields
 * while maintaining full backward compatibility with simple questions.
 */

import { RuleSchemaValidator } from '../schemaValidator.js';

describe('Enhanced AI Question Validation Tests', () => {
  describe('Backward Compatibility - Simple Questions', () => {
    it('should accept simple AI question without enhanced fields (no warnings)', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Simple Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?'
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept simple AI question with auto-generated ID (no warnings)', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Simple Spam Check',
            ai: {
              question: 'Is this spam?'
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'REMOVE',
            actionConfig: {
              reason: 'Spam detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('Enhanced Fields - Valid Configurations', () => {
    it('should accept valid confidenceGuidance with all levels', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              confidenceGuidance: {
                lowConfidence: 'Discussing dating as a topic, not seeking dates',
                mediumConfidence: 'Ambiguous language that could indicate interest',
                highConfidence: 'Explicit solicitation with location and contact info'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid confidenceGuidance with only high confidence', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              confidenceGuidance: {
                highConfidence: 'Explicit solicitation with contact info'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid analysisFramework with evidenceTypes', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              analysisFramework: {
                evidenceTypes: ['DIRECT', 'IMPLIED', 'CONTEXTUAL', 'DISCUSSION', 'NEGATED']
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid analysisFramework with falsePositiveFilters', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              analysisFramework: {
                falsePositiveFilters: [
                  'quoting or referencing rules',
                  'telling stories about past experiences',
                  'giving advice to others'
                ]
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid evidenceRequired with minPieces', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              evidenceRequired: {
                minPieces: 2
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid evidenceRequired with types array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              evidenceRequired: {
                types: ['DIRECT', 'IMPLIED']
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid negationHandling enabled=true', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              negationHandling: {
                enabled: true
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid negationHandling with patterns', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              negationHandling: {
                enabled: true,
                patterns: [
                  'not looking for {action}',
                  "don't want {action}",
                  'avoiding {action}'
                ]
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept valid examples array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  scenario: 'User posts "Looking for friends in NYC"',
                  expectedAnswer: 'NO',
                  confidence: 95,
                  reasoning: 'Explicitly looking for friendship, not romance'
                },
                {
                  scenario: 'User posts "Single and ready to mingle"',
                  expectedAnswer: 'YES',
                  confidence: 90,
                  reasoning: 'Clear romantic intent'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should accept examples without confidence field', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  scenario: 'User posts "Looking for friends"',
                  expectedAnswer: 'NO',
                  reasoning: 'Looking for friendship, not romance'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('Enhanced Fields - Invalid Configurations', () => {
    it('should warn when confidenceGuidance provided but empty', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Confidence Guidance',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              confidenceGuidance: {}
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('confidenceGuidance provided but no confidence levels defined'))).toBe(true);
    });

    it('should warn when analysisFramework.evidenceTypes is not an array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Evidence Types',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              analysisFramework: {
                evidenceTypes: 'DIRECT'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('analysisFramework.evidenceTypes must be an array'))).toBe(true);
    });

    it('should warn when analysisFramework.falsePositiveFilters is not an array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid False Positive Filters',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              analysisFramework: {
                falsePositiveFilters: 'quoting rules'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('analysisFramework.falsePositiveFilters must be an array'))).toBe(true);
    });

    it('should warn when evidenceRequired.minPieces is less than 1', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Min Pieces',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              evidenceRequired: {
                minPieces: 0
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('evidenceRequired.minPieces must be at least 1'))).toBe(true);
    });

    it('should warn when evidenceRequired.types is not an array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Evidence Types',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              evidenceRequired: {
                types: 'DIRECT'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('evidenceRequired.types must be an array'))).toBe(true);
    });

    it('should warn when negationHandling.enabled is not a boolean', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Negation Handling',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              negationHandling: {
                enabled: 'yes'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('negationHandling.enabled must be a boolean'))).toBe(true);
    });

    it('should warn when negationHandling.patterns is not an array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Negation Patterns',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              negationHandling: {
                enabled: true,
                patterns: 'not looking for'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('negationHandling.patterns must be an array'))).toBe(true);
    });

    it('should warn when examples is not an array', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Examples',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: 'Single user looking for love'
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('examples must be an array'))).toBe(true);
    });

    it('should warn when example is missing scenario field', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Example',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  expectedAnswer: 'YES',
                  confidence: 90,
                  reasoning: 'Clear romantic intent'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes("examples[0] missing 'scenario' field"))).toBe(true);
    });

    it('should warn when example is missing expectedAnswer field', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Example',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  scenario: 'User posts "Single and ready to mingle"',
                  confidence: 90,
                  reasoning: 'Clear romantic intent'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes("examples[0] missing 'expectedAnswer' field"))).toBe(true);
    });

    it('should warn when example confidence is less than 0', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Example Confidence',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  scenario: 'User posts "Looking for friends"',
                  expectedAnswer: 'NO',
                  confidence: -10,
                  reasoning: 'Looking for friendship'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('examples[0] confidence must be between 0-100'))).toBe(true);
    });

    it('should warn when example confidence is greater than 100', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Invalid Example Confidence',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              examples: [
                {
                  scenario: 'User posts "Looking for love"',
                  expectedAnswer: 'YES',
                  confidence: 150,
                  reasoning: 'Clear romantic intent'
                }
              ]
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('examples[0] confidence must be between 0-100'))).toBe(true);
    });
  });

  describe('Complex Enhanced Configurations', () => {
    it('should accept rule with all enhanced fields together', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Comprehensive Enhanced Rule',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic or sexual relationships?',
              confidenceGuidance: {
                lowConfidence: 'Discussing dating as a topic, not seeking dates',
                mediumConfidence: 'Ambiguous language that could indicate interest',
                highConfidence: 'Explicit solicitation with location and contact info'
              },
              analysisFramework: {
                evidenceTypes: ['DIRECT', 'IMPLIED', 'CONTEXTUAL', 'DISCUSSION', 'NEGATED'],
                falsePositiveFilters: [
                  'quoting or referencing rules',
                  'telling stories about past experiences'
                ]
              },
              evidenceRequired: {
                minPieces: 2,
                types: ['DIRECT', 'IMPLIED']
              },
              negationHandling: {
                enabled: true,
                patterns: ['not looking for {action}', "don't want {action}"]
              },
              examples: [
                {
                  scenario: 'User posts "Looking for friends in NYC, NOT dating"',
                  expectedAnswer: 'NO',
                  confidence: 95,
                  reasoning: 'Explicit negation of dating intent'
                },
                {
                  scenario: 'User posts "Single and ready to mingle"',
                  expectedAnswer: 'YES',
                  confidence: 90,
                  reasoning: 'Clear romantic intent'
                }
              ]
            },
            conditions: {
              logicalOperator: 'AND',
              rules: [
                {
                  field: 'ai.answer',
                  operator: '==',
                  value: 'YES'
                },
                {
                  field: 'ai.confidence',
                  operator: '>=',
                  value: 70
                }
              ]
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected with high confidence'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should handle multiple enhanced AI rules in one ruleset', async () => {
      const json = JSON.stringify({
        rules: [
          {
            name: 'Enhanced Dating Check',
            ai: {
              id: 'dating_check',
              question: 'Is this user seeking romantic relationships?',
              evidenceRequired: {
                minPieces: 2
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'FLAG',
            actionConfig: {
              reason: 'Dating content detected'
            }
          },
          {
            name: 'Enhanced Spam Check',
            ai: {
              id: 'spam_check',
              question: 'Is this spam or promotional content?',
              confidenceGuidance: {
                highConfidence: 'Multiple links to same domain or clear promotional language'
              }
            },
            conditions: {
              field: 'ai.answer',
              operator: '==',
              value: 'YES'
            },
            action: 'REMOVE',
            actionConfig: {
              reason: 'Spam detected'
            }
          }
        ]
      });

      const result = await RuleSchemaValidator.validateAndMigrate(json);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });
});
