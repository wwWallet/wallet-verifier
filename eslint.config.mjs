import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['{config,src}/**/*.ts'];
const browserFiles = ['public/js/**/*.js'];

export default defineConfig(
	{
		ignores: ['build/**', 'dist/**', 'node_modules/**'],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
		},
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: typescriptFiles,
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'prefer-const': 'off',
			'no-undef': 'off',
		},
	},
	{
		files: browserFiles,
		languageOptions: {
			globals: {
				...globals.browser,
				JSONEditor: 'readonly',
			},
		},
		rules: {
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
);
