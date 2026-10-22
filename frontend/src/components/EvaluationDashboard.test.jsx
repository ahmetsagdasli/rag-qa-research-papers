import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import EvaluationDashboard from './EvaluationDashboard';
vi.mock('../api', () => ({ listEvaluations: vi.fn(), listEvaluationDatasets: vi.fn().mockResolvedValue({ datasets: [] }), createEvaluation: vi.fn() }));
import { listEvaluations } from '../api';
it('shows loading, empty and error states', async () => { listEvaluations.mockReturnValueOnce(new Promise(() => {})); const { unmount }=render(<EvaluationDashboard/>); expect(screen.getByText(/Loading experiment history/i)).toBeInTheDocument(); unmount(); listEvaluations.mockResolvedValueOnce({evaluations:[]}); render(<EvaluationDashboard/>); expect(await screen.findByText(/No evaluation runs yet/i)).toBeInTheDocument(); });
