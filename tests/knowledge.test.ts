import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
    initDatabase, 
    addEvent, 
    createKnowledgeObject,
    getKnowledgeObjects,
    knowledgeObjectExists,
    resetDatabase,
    getDatabase,
    searchProjectKnowledge,
} from '../src/db.js';
import { handleSaveKnowledge, handleSearchProjectKnowledge } from '../src/handlers.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), '.wormhole-test-knowledge');

describe.sequential('Knowledge Object Generation', () => {
    beforeAll(() => {
        // Reset database connection
        resetDatabase();
        
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
        }
        process.env.WORMHOLE_DIR = TEST_DB_PATH;
        
        // Initialize fresh database
        initDatabase();
    });

    afterAll(() => {
        // Reset database connection
        resetDatabase();
        
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
        }
    });

    function cleanupTestData() {
        const db = getDatabase();
        // Delete in correct order due to foreign key constraints
        db.exec('DELETE FROM knowledge_objects');
        db.exec('DELETE FROM timeline');
        db.exec('DELETE FROM sessions');
        
        // Recreate knowledge_objects table without foreign key constraint
        db.exec('DROP TABLE IF EXISTS knowledge_objects');
        db.exec(`
            CREATE TABLE knowledge_objects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_path TEXT NOT NULL,
                knowledge_type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source_event_id INTEGER,
                confidence REAL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                metadata TEXT
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_objects(project_path, knowledge_type)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_objects(source_event_id)');
    }

    describe('Database Functions', () => {
        it('should create a knowledge object', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            const id = createKnowledgeObject(
                '/test/project',
                'decision',
                'Test Decision',
                'This is a test decision',
                eventId,
                1.0
            );

            expect(id).toBeGreaterThan(0);
        });

        it('should retrieve knowledge objects by project', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            createKnowledgeObject('/test/project', 'decision', 'Decision 1', 'Content 1', eventId, 1.0);
            createKnowledgeObject('/test/project', 'pitfall', 'Pitfall 1', 'Content 2', eventId, 0.8);

            const allKnowledge = getKnowledgeObjects('/test/project');
            expect(allKnowledge).toHaveLength(2);

            const decisions = getKnowledgeObjects('/test/project', 'decision');
            expect(decisions).toHaveLength(1);
            expect(decisions[0].knowledge_type).toBe('decision');
        });

        it('should check if knowledge object exists', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            createKnowledgeObject('/test/project', 'decision', 'Unique Title', 'Content', eventId, 1.0);

            expect(knowledgeObjectExists('/test/project', 'decision', 'Unique Title')).toBe(true);
            expect(knowledgeObjectExists('/test/project', 'decision', 'Other Title')).toBe(false);
        });
    });

    describe('Knowledge Extraction', () => {
        it('should save knowledge object with all fields', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: 'Use TypeScript for the project',
                content: JSON.stringify({
                    decision: 'Use TypeScript for the project',
                    rationale: 'Better type safety',
                    alternatives: 'JavaScript, Flow'
                }),
                confidence: 1.0,
                metadata: { agent_id: 'test-agent', timestamp: Date.now() }
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);
            expect(parsed.id).toBeGreaterThan(0);

            const knowledge = getKnowledgeObjects('/test/project', 'decision');
            expect(knowledge.length).toBeGreaterThan(0);
            expect(knowledge[0].title).toBe('Use TypeScript for the project');
        });

        it('should save pitfall knowledge', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'pitfall',
                title: 'Test failure: auth.test.ts',
                content: JSON.stringify({
                    test_suite: 'auth.test.ts',
                    summary: 'Authentication tests failed',
                    status: 'failed'
                }),
                confidence: 0.7
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'pitfall');
            expect(knowledge.length).toBeGreaterThan(0);
            expect(knowledge[0].title).toContain('auth.test.ts');
        });

        it('should save constraint knowledge', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'constraint',
                title: 'API rate limit is 100 req/min',
                content: JSON.stringify({
                    limitation: 'API rate limit',
                    value: '100 requests per minute',
                    source: 'API documentation'
                })
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'constraint');
            expect(knowledge.length).toBeGreaterThan(0);
        });

        it('should save convention knowledge', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'convention',
                title: 'Use MVC pattern',
                content: JSON.stringify({
                    pattern: 'MVC',
                    description: 'All controllers should follow MVC pattern'
                }),
                confidence: 0.8
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'convention');
            expect(knowledge.length).toBeGreaterThan(0);
        });

        it('should reject duplicate knowledge', () => {
            cleanupTestData();
            
            // First save
            const result1 = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: 'Use TypeScript for the project',
                content: 'Use TypeScript for better type safety'
            });

            const parsed1 = JSON.parse(result1);
            expect(parsed1.success).toBe(true);

            // Try to save duplicate
            const result2 = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: 'Use TypeScript for the project',
                content: 'Different content but same title'
            });

            const parsed2 = JSON.parse(result2);
            expect(parsed2.success).toBe(false);
            expect(parsed2.duplicate).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'decision');
            expect(knowledge).toHaveLength(1);
        });

        it('should reject title over 200 characters', () => {
            cleanupTestData();
            
            const longTitle = 'a'.repeat(201);
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: longTitle,
                content: 'Content'
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('200 characters');
        });

        it('should save knowledge with source event reference', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: 'Decision from event',
                content: 'Content based on event analysis',
                source_event_id: eventId
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'decision');
            expect(knowledge[0].source_event_id).toBe(eventId);
        });

        it('should use default confidence of 1.0', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'decision',
                title: 'Test decision',
                content: 'Test content'
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'decision');
            expect(knowledge[0].confidence).toBe(1.0);
        });

        it('should save knowledge with custom confidence', () => {
            cleanupTestData();
            
            const result = handleSaveKnowledge({
                project_path: '/test/project',
                knowledge_type: 'pitfall',
                title: 'Potential pitfall',
                content: 'Not fully verified',
                confidence: 0.6
            });

            const parsed = JSON.parse(result);
            expect(parsed.success).toBe(true);

            const knowledge = getKnowledgeObjects('/test/project', 'pitfall');
            expect(knowledge[0].confidence).toBe(0.6);
        });
    });

    describe('Knowledge Object Metadata', () => {
        it('should store metadata with knowledge objects', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            createKnowledgeObject(
                '/test/project',
                'decision',
                'Test Decision',
                'Content',
                eventId,
                0.95,
                { custom: 'data', tags: ['important'] }
            );

            const knowledge = getKnowledgeObjects('/test/project');
            expect(knowledge[0].metadata).toBeTruthy();
            
            const metadata = JSON.parse(knowledge[0].metadata!);
            expect(metadata.custom).toBe('data');
            expect(metadata.tags).toEqual(['important']);
        });

        it('should store confidence levels', () => {
            cleanupTestData();
            
            const eventId = addEvent('test-agent', 'decision', JSON.stringify({ decision: 'test' }), '/test/project');
            
            createKnowledgeObject('/test/project', 'decision', 'High Confidence', 'Content', eventId, 1.0);
            createKnowledgeObject('/test/project', 'pitfall', 'Low Confidence', 'Content', eventId, 0.5);

            const knowledge = getKnowledgeObjects('/test/project');
            const highConf = knowledge.find(k => k.title === 'High Confidence');
            const lowConf = knowledge.find(k => k.title === 'Low Confidence');

            expect(highConf?.confidence).toBe(1.0);
            expect(lowConf?.confidence).toBe(0.5);
        });
    });

    describe('Search Project Knowledge', () => {
        it('should return empty results when no knowledge exists', () => {
            cleanupTestData();
            
            const results = searchProjectKnowledge('/test/project', 'unknown');
            expect(results).toHaveLength(0);
        });

        it('should return all knowledge sorted by confidence', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Low conf decision', 'Content', null, 0.5);
            createKnowledgeObject('/test/project', 'pitfall', 'High conf pitfall', 'Content', null, 1.0);
            createKnowledgeObject('/test/project', 'constraint', 'Medium conf constraint', 'Content', null, 0.7);

            const results = searchProjectKnowledge('/test/project', 'unknown');
            
            expect(results).toHaveLength(3);
            // unknown intent has no preference, so sorted by confidence
            expect(results[0].confidence).toBe(1.0);
            expect(results[1].confidence).toBe(0.7);
            expect(results[2].confidence).toBe(0.5);
        });

        it('should prioritize pitfall and constraint for debugging intent', () => {
            cleanupTestData();
            
            // Same confidence, different types
            createKnowledgeObject('/test/project', 'decision', 'A decision', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'pitfall', 'A pitfall', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'constraint', 'A constraint', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'convention', 'A convention', 'Content', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'debugging');
            
            expect(results).toHaveLength(4);
            // pitfall should be first (2.0 boost), constraint second (1.5 boost)
            expect(results[0].type).toBe('pitfall');
            expect(results[1].type).toBe('constraint');
        });

        it('should prioritize decision and convention for feature intent', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'pitfall', 'A pitfall', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'decision', 'A decision', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'convention', 'A convention', 'Content', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'feature');
            
            expect(results).toHaveLength(3);
            expect(results[0].type).toBe('decision');
            expect(results[1].type).toBe('convention');
        });

        it('should prioritize convention and constraint for refactor intent', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'A decision', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'convention', 'A convention', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'constraint', 'A constraint', 'Content', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'refactor');
            
            expect(results).toHaveLength(3);
            expect(results[0].type).toBe('convention');
            expect(results[1].type).toBe('constraint');
        });

        it('should prioritize pitfall for test intent', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'A decision', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'pitfall', 'A pitfall', 'Content', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'test');
            
            expect(results).toHaveLength(2);
            expect(results[0].type).toBe('pitfall');
        });

        it('should filter results by query text', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Use TypeScript for type safety', 'TS is great', null, 0.9);
            createKnowledgeObject('/test/project', 'decision', 'Use React for UI', 'React is best', null, 0.9);
            createKnowledgeObject('/test/project', 'pitfall', 'Avoid TypeScript any types', 'any is bad', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'unknown', 'typescript');
            
            expect(results).toHaveLength(2);
            expect(results.every(r => 
                r.summary.toLowerCase().includes('typescript')
            )).toBe(true);
        });

        it('should boost exact title matches when query provided', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Use TypeScript for safety', 'Content about typescript', null, 0.8);
            createKnowledgeObject('/test/project', 'decision', 'Another decision', 'Content mentions typescript here', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'unknown', 'typescript');
            
            expect(results).toHaveLength(2);
            // Title match should be boosted
            expect(results[0].summary).toBe('Use TypeScript for safety');
        });

        it('should limit results to max 10', () => {
            cleanupTestData();
            
            // Create 15 knowledge objects
            for (let i = 0; i < 15; i++) {
                createKnowledgeObject('/test/project', 'decision', `Decision ${i}`, 'Content', null, 0.5 + (i * 0.03));
            }

            const results = searchProjectKnowledge('/test/project', 'unknown');
            
            expect(results.length).toBeLessThanOrEqual(10);
        });

        it('should be deterministic with same inputs', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Decision A', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'decision', 'Decision B', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'pitfall', 'Pitfall A', 'Content', null, 0.8);

            const results1 = searchProjectKnowledge('/test/project', 'feature');
            const results2 = searchProjectKnowledge('/test/project', 'feature');
            
            expect(results1).toEqual(results2);
        });

        it('should scope results to project_path only', () => {
            cleanupTestData();
            
            createKnowledgeObject('/project-a', 'decision', 'Project A decision', 'Content', null, 1.0);
            createKnowledgeObject('/project-b', 'decision', 'Project B decision', 'Content', null, 1.0);

            const resultsA = searchProjectKnowledge('/project-a', 'unknown');
            const resultsB = searchProjectKnowledge('/project-b', 'unknown');
            
            expect(resultsA).toHaveLength(1);
            expect(resultsA[0].summary).toBe('Project A decision');
            expect(resultsB).toHaveLength(1);
            expect(resultsB[0].summary).toBe('Project B decision');
        });

        it('should return correct output format', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'pitfall', 'Test pitfall', 'Content', null, 0.75);

            const results = searchProjectKnowledge('/test/project', 'debugging');
            
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({
                type: 'pitfall',
                summary: 'Test pitfall',
                confidence: 0.75
            });
        });

        it('should handle empty query string', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'A decision', 'Content', null, 0.8);

            const results = searchProjectKnowledge('/test/project', 'unknown', '');
            
            expect(results).toHaveLength(1);
        });

        it('should handle query with multiple words', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Use async await pattern', 'Content about async', null, 0.8);
            createKnowledgeObject('/test/project', 'decision', 'Use promises', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'pitfall', 'Avoid callback hell', 'Content about await', null, 0.7);

            const results = searchProjectKnowledge('/test/project', 'unknown', 'async await');
            
            // Should match items containing either 'async' OR 'await'
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle handler correctly', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Test decision', 'Content', null, 0.9);
            createKnowledgeObject('/test/project', 'pitfall', 'Test pitfall', 'Content', null, 0.8);

            const result = handleSearchProjectKnowledge({
                project_path: '/test/project',
                intent: 'debugging'
            });

            const parsed = JSON.parse(result);
            expect(parsed.results).toBeDefined();
            expect(parsed.results.length).toBe(2);
            // debugging prioritizes pitfall
            expect(parsed.results[0].type).toBe('pitfall');
        });

        it('should handle handler with query', () => {
            cleanupTestData();
            
            createKnowledgeObject('/test/project', 'decision', 'Auth decision', 'Content', null, 0.9);
            createKnowledgeObject('/test/project', 'pitfall', 'Auth pitfall', 'Content', null, 0.8);
            createKnowledgeObject('/test/project', 'decision', 'Database decision', 'Content', null, 0.9);

            const result = handleSearchProjectKnowledge({
                project_path: '/test/project',
                intent: 'feature',
                query: 'auth'
            });

            const parsed = JSON.parse(result);
            expect(parsed.results.length).toBe(2);
            expect(parsed.results.every((r: any) => r.summary.toLowerCase().includes('auth'))).toBe(true);
        });

        it('should include non-preferred types but rank them lower', () => {
            cleanupTestData();
            
            // High confidence non-preferred type
            createKnowledgeObject('/test/project', 'convention', 'A convention', 'Content', null, 1.0);
            // Lower confidence preferred type
            createKnowledgeObject('/test/project', 'pitfall', 'A pitfall', 'Content', null, 0.5);

            const results = searchProjectKnowledge('/test/project', 'debugging');
            
            expect(results).toHaveLength(2);
            // pitfall is preferred for debugging, but convention has higher confidence
            // pitfall gets +2.0 boost: 0.5 + 2.0 = 2.5
            // convention gets no boost: 1.0
            // So pitfall should rank first
            expect(results[0].type).toBe('pitfall');
            expect(results[1].type).toBe('convention');
        });
    });
});
