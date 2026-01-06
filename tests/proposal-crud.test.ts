/**
 * Tests for proposal CRUD operations
 * Tests: validateProposal, createProposal, editProposal, approveProposal, rejectProposal, bulkRejectProposals
 *
 * These tests mock the Foundry API (Actions.apply) to avoid real network calls.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateProposal,
  createProposal,
  editProposal,
  approveProposal,
  rejectProposal,
  bulkRejectProposals,
  type ProposalInput,
  type EditProposalInput,
  type ResolvedConfig,
} from '../src/index.js';

// Mock the Foundry modules
vi.mock('@osdk/foundry.ontologies', () => ({
  Actions: {
    apply: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('@osdk/client', () => ({
  createPlatformClient: vi.fn().mockReturnValue({})
}));

// Import the mocked modules
import { Actions } from '@osdk/foundry.ontologies';
import { createPlatformClient } from '@osdk/client';

// Mock resolved config
const mockConfig: ResolvedConfig = {
  version: '1.0.0',
  workflow: {
    name: 'Test Workflow',
    workflowRid: 'ri.taurus.main.workflow.test-123',
    objectType: {
      id: 'test.object-type',
      dynamicLookup: false,
      properties: [
        { id: 'name', type: 'string', description: 'Name field' },
        { id: 'status', type: 'string', description: 'Status field' },
        { id: 'price', type: 'number', description: 'Price field' },
      ],
    },
    output: {
      id: 'output-123',
      version: '1.0.0',
      parameters: [],
    },
  },
  foundry: {
    url: 'https://test.palantirfoundry.com',
    ontologyRid: 'ri.ontology.main.ontology.test-123',
    token: 'test-token-value',
  },
  sdk: {
    packageName: '@test/sdk',
    archetypes: {
      proposal: 'TestProposalArchetype',
      rule: 'TestRuleArchetype',
    },
    actions: {
      createProposal: 'test-create-proposal',
      approveProposal: 'test-approve-proposal',
      rejectProposal: 'test-reject-proposal',
      editProposal: 'test-edit-proposal',
    },
  },
  validation: {
    grammarVersion: 'V1',
    supportedStrategyTypes: ['filterNode'],
    supportedStringFilters: ['EQUALS', 'CONTAINS'],
    unsupportedStringFilters: ['REGEX'],
    supportedNumericFilters: ['EQUALS', 'GREATER_THAN'],
    supportedNullFilters: ['NULL', 'NOT_NULL'],
  },
  conventions: {
    proposalIdPrefix: 'TEST-PROP-',
    ruleIdPrefix: 'TEST-RULE-',
    defaultAuthor: 'test-author',
    defaultDescription: 'Test description',
    defaultKeywords: 'test',
  },
};

// Config with missing token
const mockConfigNoToken: ResolvedConfig = {
  ...mockConfig,
  foundry: {
    ...mockConfig.foundry,
    token: '',
  },
};

describe('Proposal Validation', () => {

  describe('validateProposal()', () => {

    test('should validate proposal with template and params', () => {
      const proposal: ProposalInput = {
        name: 'Test Rule',
        template: 'string-equals',
        params: {
          propertyId: 'name',
          value: 'test',
        },
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(true);
      expect(result.structureErrors).toHaveLength(0);
      expect(result.propertyErrors).toHaveLength(0);
      expect(result.filterErrors).toHaveLength(0);
    });

    test('should validate proposal with raw logic', () => {
      const proposal: ProposalInput = {
        name: 'Test Rule',
        logic: {
          grammarVersion: 'V1',
          workflowRid: 'ri.taurus.main.workflow.test-123',
          strategy: {
            type: 'filterNode',
            filterNode: {
              filter: {
                columnFilterRule: {
                  column: {
                    objectProperty: {
                      objectTypeId: 'test.object-type',
                      propertyTypeId: 'name',
                    },
                  },
                  filter: {
                    stringColumnFilter: {
                      type: 'EQUALS',
                      values: ['test'],
                    },
                  },
                },
              },
            },
          },
          effect: {
            type: 'v2',
            v2: {
              outputAndVersion: {
                outputId: 'output-123',
                outputVersion: '1.0.0',
              },
            },
          },
        },
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(true);
    });

    test('should fail when neither template nor logic provided', () => {
      const proposal: ProposalInput = {
        name: 'Test Rule',
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(false);
      expect(result.structureErrors).toContain('Either template+params or logic must be provided');
    });

    test('should fail for invalid template params', () => {
      const proposal: ProposalInput = {
        template: 'string-equals',
        params: {
          // Missing required 'value' parameter
          propertyId: 'name',
        },
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(false);
      expect(result.structureErrors.some(e => e.includes('value'))).toBe(true);
    });

    test('should fail for invalid property', () => {
      const proposal: ProposalInput = {
        template: 'string-equals',
        params: {
          propertyId: 'nonexistent_property',
          value: 'test',
        },
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(false);
      expect(result.propertyErrors.some(e => e.includes('nonexistent_property'))).toBe(true);
    });

    test('should fail for unsupported filter type in raw logic', () => {
      const proposal: ProposalInput = {
        logic: {
          grammarVersion: 'V1',
          workflowRid: 'ri.taurus.main.workflow.test-123',
          strategy: {
            type: 'filterNode',
            filterNode: {
              filter: {
                columnFilterRule: {
                  column: {
                    objectProperty: {
                      objectTypeId: 'test.object-type',
                      propertyTypeId: 'name',
                    },
                  },
                  filter: {
                    stringColumnFilter: {
                      type: 'REGEX', // Unsupported
                      values: ['test.*'],
                    },
                  },
                },
              },
            },
          },
          effect: {
            type: 'v2',
            v2: {
              outputAndVersion: { outputId: 'x', outputVersion: '1' },
            },
          },
        },
      };

      const result = validateProposal(proposal, mockConfig);

      expect(result.valid).toBe(false);
      expect(result.filterErrors.some(e => e.includes('REGEX'))).toBe(true);
    });
  });
});

describe('Proposal CRUD Operations', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProposal()', () => {

    test('should create proposal with template', async () => {
      const proposal: ProposalInput = {
        name: 'Test Rule',
        description: 'Test description',
        keywords: 'test,rule',
        template: 'string-equals',
        params: {
          propertyId: 'name',
          value: 'test',
        },
      };

      const result = await createProposal(proposal, mockConfig);

      expect(result.success).toBe(true);
      expect(result.proposalId).toMatch(/^TEST-PROP-/);
      expect(result.ruleId).toMatch(/^TEST-RULE-/);
      expect(result.compressedLogic).toBeTruthy();
      expect(Actions.apply).toHaveBeenCalledTimes(1);
    });

    test('should throw for validation failure', async () => {
      const proposal: ProposalInput = {
        template: 'string-equals',
        params: {
          propertyId: 'nonexistent',
          value: 'test',
        },
      };

      await expect(createProposal(proposal, mockConfig)).rejects.toThrow('Validation failed');
    });

    test('should throw when token is missing', async () => {
      const proposal: ProposalInput = {
        template: 'string-equals',
        params: {
          propertyId: 'name',
          value: 'test',
        },
      };

      await expect(createProposal(proposal, mockConfigNoToken)).rejects.toThrow('FOUNDRY_TOKEN not set');
    });

    test('should use default values from config', async () => {
      const proposal: ProposalInput = {
        // No name, description, or keywords
        template: 'string-equals',
        params: {
          propertyId: 'name',
          value: 'test',
        },
      };

      const result = await createProposal(proposal, mockConfig);

      expect(result.success).toBe(true);
      // Check that Actions.apply was called with default values
      const applyCall = vi.mocked(Actions.apply).mock.calls[0];
      const params = applyCall[3] as { parameters: Record<string, unknown> };
      expect(params.parameters.proposal_author).toBe('test-author');
    });

    test('should call Actions.apply with correct parameters', async () => {
      const proposal: ProposalInput = {
        name: 'My Rule',
        template: 'string-equals',
        params: {
          propertyId: 'name',
          value: 'test',
        },
      };

      await createProposal(proposal, mockConfig);

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(), // client
        'ri.ontology.main.ontology.test-123', // ontologyId
        'test-create-proposal', // actionApiName
        expect.objectContaining({
          parameters: expect.objectContaining({
            new_rule_name: 'My Rule',
            proposal_author: 'test-author',
          }),
        })
      );
    });
  });

  describe('editProposal()', () => {

    test('should edit proposal name only', async () => {
      const input: EditProposalInput = {
        proposalId: 'TEST-PROP-123',
        name: 'Updated Name',
      };

      const result = await editProposal(input, mockConfig);

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('TEST-PROP-123');
      expect(Actions.apply).toHaveBeenCalledTimes(1);
    });

    test('should edit proposal with new logic', async () => {
      const input: EditProposalInput = {
        proposalId: 'TEST-PROP-123',
        template: 'string-equals',
        params: {
          propertyId: 'status',
          value: 'active',
        },
      };

      const result = await editProposal(input, mockConfig);

      expect(result.success).toBe(true);
      expect(result.compressedLogic).toBeTruthy();
    });

    test('should throw for invalid logic update', async () => {
      const input: EditProposalInput = {
        proposalId: 'TEST-PROP-123',
        template: 'string-equals',
        params: {
          propertyId: 'nonexistent',
          value: 'test',
        },
      };

      await expect(editProposal(input, mockConfig)).rejects.toThrow('Validation failed');
    });

    test('should call correct action', async () => {
      const input: EditProposalInput = {
        proposalId: 'TEST-PROP-123',
        description: 'New description',
      };

      await editProposal(input, mockConfig);

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-edit-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_object: 'TEST-PROP-123',
            new_rule_description: 'New description',
          }),
        })
      );
    });
  });

  describe('approveProposal()', () => {

    test('should approve proposal successfully', async () => {
      const result = await approveProposal('TEST-PROP-123', 'TEST-RULE-123', mockConfig);

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('TEST-PROP-123');
      expect(result.message).toContain('approved successfully');
      expect(Actions.apply).toHaveBeenCalledTimes(1);
    });

    test('should use custom reviewer', async () => {
      await approveProposal('TEST-PROP-123', 'TEST-RULE-123', mockConfig, 'custom-reviewer');

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-approve-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_reviewer: 'custom-reviewer',
            rule_id: 'TEST-RULE-123',
          }),
        })
      );
    });

    test('should use default author as reviewer when not specified', async () => {
      await approveProposal('TEST-PROP-123', 'TEST-RULE-123', mockConfig);

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-approve-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_reviewer: 'test-author',
          }),
        })
      );
    });

    test('should throw when token is missing', async () => {
      await expect(
        approveProposal('TEST-PROP-123', 'TEST-RULE-123', mockConfigNoToken)
      ).rejects.toThrow('FOUNDRY_TOKEN not set');
    });
  });

  describe('rejectProposal()', () => {

    test('should reject proposal successfully', async () => {
      const result = await rejectProposal('TEST-PROP-123', mockConfig);

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('TEST-PROP-123');
      expect(result.message).toContain('rejected successfully');
      expect(Actions.apply).toHaveBeenCalledTimes(1);
    });

    test('should use custom reviewer', async () => {
      await rejectProposal('TEST-PROP-123', mockConfig, 'custom-reviewer');

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-reject-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_reviewer: 'custom-reviewer',
          }),
        })
      );
    });

    test('should call correct action', async () => {
      await rejectProposal('TEST-PROP-123', mockConfig);

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        'ri.ontology.main.ontology.test-123',
        'test-reject-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_object: 'TEST-PROP-123',
          }),
        })
      );
    });

    test('should throw when token is missing', async () => {
      await expect(
        rejectProposal('TEST-PROP-123', mockConfigNoToken)
      ).rejects.toThrow('FOUNDRY_TOKEN not set');
    });
  });

  describe('bulkRejectProposals()', () => {

    test('should reject all proposals successfully', async () => {
      const proposalIds = ['PROP-1', 'PROP-2', 'PROP-3'];
      const result = await bulkRejectProposals(proposalIds, mockConfig);

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.rejected).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(Actions.apply).toHaveBeenCalledTimes(3);
    });

    test('should handle partial failures', async () => {
      // Mock first two calls succeed, third fails
      vi.mocked(Actions.apply)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('API error'));

      const proposalIds = ['PROP-1', 'PROP-2', 'PROP-3'];
      const result = await bulkRejectProposals(proposalIds, mockConfig);

      expect(result.success).toBe(false);
      expect(result.total).toBe(3);
      expect(result.rejected).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[2].success).toBe(false);
      expect(result.results[2].message).toContain('Failed to reject');
    });

    test('should handle all failures', async () => {
      vi.mocked(Actions.apply).mockRejectedValue(new Error('API error'));

      const proposalIds = ['PROP-1', 'PROP-2'];
      const result = await bulkRejectProposals(proposalIds, mockConfig);

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(0);
      expect(result.failed).toBe(2);
    });

    test('should handle empty array', async () => {
      const result = await bulkRejectProposals([], mockConfig);

      expect(result.success).toBe(true);
      expect(result.total).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.failed).toBe(0);
      expect(Actions.apply).not.toHaveBeenCalled();
    });

    test('should pass reason as reviewer', async () => {
      await bulkRejectProposals(['PROP-1'], mockConfig, 'bulk-cleanup');

      expect(Actions.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-reject-proposal',
        expect.objectContaining({
          parameters: expect.objectContaining({
            proposal_reviewer: 'bulk-cleanup',
          }),
        })
      );
    });
  });
});
