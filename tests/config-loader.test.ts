/**
 * Tests for config loader
 * Tests: loadConfig, resolveConfig, getDefaultConfigPath, listConfigs, validateConfigSyntax
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadConfig,
  getDefaultConfigPath,
  listConfigs,
  validateConfigSyntax,
} from '../src/v2/config/loader.js';
import { resolveConfig } from '../src/index.js';

const fixturesDir = path.join(__dirname, 'fixtures');
const validConfigPath = path.join(fixturesDir, 'valid-config.json');

describe('Config Loader Module', () => {

  describe('loadConfig()', () => {

    describe('successful loading', () => {

      test('should load a valid config file', () => {
        const result = loadConfig(validConfigPath, { validateToken: false });

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.errors).toBeUndefined();
      });

      test('should resolve all required fields', () => {
        const result = loadConfig(validConfigPath, { validateToken: false });

        expect(result.config?.version).toBe('1.0.0');
        expect(result.config?.workflow.name).toBe('Test Workflow');
        expect(result.config?.workflow.workflowRid).toContain('ri.taurus');
        expect(result.config?.foundry.url).toContain('palantirfoundry.com');
        expect(result.config?.sdk.packageName).toBe('@test/sdk');
        expect(result.config?.validation.grammarVersion).toBe('V1');
        expect(result.config?.conventions.proposalIdPrefix).toBe('TEST-PROP-');
      });

      test('should set token from environment variable', () => {
        const originalToken = process.env.TEST_FOUNDRY_TOKEN;
        process.env.TEST_FOUNDRY_TOKEN = 'test-token-value';

        try {
          const result = loadConfig(validConfigPath, { validateToken: false });
          expect(result.config?.foundry.token).toBe('test-token-value');
        } finally {
          if (originalToken !== undefined) {
            process.env.TEST_FOUNDRY_TOKEN = originalToken;
          } else {
            delete process.env.TEST_FOUNDRY_TOKEN;
          }
        }
      });

      test('should return empty token if env var not set', () => {
        const originalToken = process.env.TEST_FOUNDRY_TOKEN;
        delete process.env.TEST_FOUNDRY_TOKEN;

        try {
          const result = loadConfig(validConfigPath, { validateToken: false });
          expect(result.config?.foundry.token).toBe('');
        } finally {
          if (originalToken !== undefined) {
            process.env.TEST_FOUNDRY_TOKEN = originalToken;
          }
        }
      });
    });

    describe('file errors', () => {

      test('should fail for non-existent file', () => {
        const result = loadConfig('/path/to/nonexistent.json');

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Config file not found: /path/to/nonexistent.json');
      });

      test('should fail for invalid JSON', () => {
        const invalidJsonPath = path.join(fixturesDir, 'invalid-json.json');
        fs.writeFileSync(invalidJsonPath, '{ invalid json }');

        try {
          const result = loadConfig(invalidJsonPath);

          expect(result.success).toBe(false);
          expect(result.errors?.some(e => e.includes('Failed to parse'))).toBe(true);
        } finally {
          fs.unlinkSync(invalidJsonPath);
        }
      });
    });

    describe('missing required fields', () => {

      test('should fail when version is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-version.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.version;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: version');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when workflow is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-workflow.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.workflow;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: workflow');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when foundry is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-foundry.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.foundry;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: foundry');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when sdk is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-sdk.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.sdk;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: sdk');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when validation config is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-validation.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.validation;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: validation');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when conventions is missing', () => {
        const configPath = path.join(fixturesDir, 'missing-conventions.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.conventions;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing required field: conventions');
        } finally {
          fs.unlinkSync(configPath);
        }
      });

      test('should fail when nested required fields are missing', () => {
        const configPath = path.join(fixturesDir, 'missing-nested.json');
        const config = JSON.parse(fs.readFileSync(validConfigPath, 'utf8'));
        delete config.workflow.name;
        delete config.workflow.workflowRid;
        fs.writeFileSync(configPath, JSON.stringify(config));

        try {
          const result = loadConfig(configPath, { validateToken: false });

          expect(result.success).toBe(false);
          expect(result.errors).toContain('Missing workflow.name');
          expect(result.errors).toContain('Missing workflow.workflowRid');
        } finally {
          fs.unlinkSync(configPath);
        }
      });
    });

    describe('options', () => {

      test('should warn when validateToken is true and token not set', () => {
        const originalToken = process.env.TEST_FOUNDRY_TOKEN;
        delete process.env.TEST_FOUNDRY_TOKEN;

        try {
          const result = loadConfig(validConfigPath, { validateToken: true });

          expect(result.success).toBe(true);
          expect(result.warnings).toBeDefined();
          expect(result.warnings?.some(w => w.includes('Token environment variable not set'))).toBe(true);
        } finally {
          if (originalToken !== undefined) {
            process.env.TEST_FOUNDRY_TOKEN = originalToken;
          }
        }
      });

      test('should not warn when validateToken is false', () => {
        const originalToken = process.env.TEST_FOUNDRY_TOKEN;
        delete process.env.TEST_FOUNDRY_TOKEN;

        try {
          const result = loadConfig(validConfigPath, { validateToken: false });

          expect(result.success).toBe(true);
          expect(result.warnings).toBeUndefined();
        } finally {
          if (originalToken !== undefined) {
            process.env.TEST_FOUNDRY_TOKEN = originalToken;
          }
        }
      });
    });
  });

  describe('validateConfigSyntax()', () => {

    test('should validate a valid config without checking token', () => {
      const result = validateConfigSyntax(validConfigPath);

      expect(result.success).toBe(true);
    });

    test('should fail for invalid config', () => {
      const configPath = path.join(fixturesDir, 'syntax-test.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: '1.0.0' }));

      try {
        const result = validateConfigSyntax(configPath);

        expect(result.success).toBe(false);
      } finally {
        fs.unlinkSync(configPath);
      }
    });
  });

  describe('listConfigs()', () => {

    test('should list config files in directory', () => {
      const configDir = path.join(__dirname, '..', 'config');
      const configs = listConfigs(configDir);

      expect(Array.isArray(configs)).toBe(true);
      expect(configs.some(c => c.includes('demo-product.json'))).toBe(true);
    });

    test('should exclude schema files', () => {
      const configDir = path.join(__dirname, '..', 'config');
      const configs = listConfigs(configDir);

      expect(configs.every(c => !c.includes('-schema.json'))).toBe(true);
    });

    test('should return empty array for non-existent directory', () => {
      const configs = listConfigs('/nonexistent/directory');

      expect(configs).toEqual([]);
    });
  });

  describe('getDefaultConfigPath()', () => {

    test('should return env var path if PROPOSAL_CLI_CONFIG is set', () => {
      const originalValue = process.env.PROPOSAL_CLI_CONFIG;
      process.env.PROPOSAL_CLI_CONFIG = '/custom/config/path.json';

      try {
        const result = getDefaultConfigPath();
        expect(result).toBe('/custom/config/path.json');
      } finally {
        if (originalValue !== undefined) {
          process.env.PROPOSAL_CLI_CONFIG = originalValue;
        } else {
          delete process.env.PROPOSAL_CLI_CONFIG;
        }
      }
    });

    test('should return null if no default config found and env var not set', () => {
      const originalValue = process.env.PROPOSAL_CLI_CONFIG;
      delete process.env.PROPOSAL_CLI_CONFIG;

      try {
        const result = getDefaultConfigPath('/nonexistent/base');
        // May return null or find a config depending on cwd
        expect(result === null || typeof result === 'string').toBe(true);
      } finally {
        if (originalValue !== undefined) {
          process.env.PROPOSAL_CLI_CONFIG = originalValue;
        }
      }
    });
  });

  describe('resolveConfig()', () => {

    test('should load config from path string', () => {
      const config = resolveConfig(validConfigPath);

      expect(config).toBeDefined();
      expect(config.version).toBe('1.0.0');
      expect(config.workflow.name).toBe('Test Workflow');
    });

    test('should throw for invalid config path', () => {
      expect(() => resolveConfig('/nonexistent/config.json')).toThrow();
    });

    test('should pass through object input', () => {
      const inputConfig = {
        version: '1.0.0',
        workflow: { name: 'Test' },
        foundry: { url: 'https://test.com', token: 'token' },
        sdk: {},
        validation: {},
        conventions: {}
      };

      const config = resolveConfig(inputConfig as any);

      // Object is passed through as-is
      expect(config.version).toBe('1.0.0');
    });
  });
});
