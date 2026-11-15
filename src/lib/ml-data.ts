import { useEffect, useState } from 'react';
import type { CellsData, ModelData } from './finder';

// The Analog Finder files are produced offline by pipeline/build_all.py. Loaded once, then cached.
let modelPromise: Promise<ModelData> | null = null;
let cellsPromise: Promise<CellsData> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`MISSING ${url}`);
  return (await res.json()) as T;
}

export function loadModel(): Promise<ModelData> {
  if (!modelPromise) {
    modelPromise = getJson<ModelData>('/ml/model.json');
    modelPromise.catch(() => (modelPromise = null));
  }
  return modelPromise;
}
export function loadCells(): Promise<CellsData> {
  if (!cellsPromise) {
    cellsPromise = getJson<CellsData>('/ml/cells.json');
    cellsPromise.catch(() => (cellsPromise = null));
  }
  return cellsPromise;
}

export type MlState<T> = { status: 'loading' } | { status: 'missing' } | ({ status: 'ok' } & T);

export function useModel(): MlState<{ model: ModelData }> {
  const [s, setS] = useState<MlState<{ model: ModelData }>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    loadModel()
      .then((model) => alive && setS({ status: 'ok', model }))
      .catch(() => alive && setS({ status: 'missing' }));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

export function useMl(): MlState<{ model: ModelData; cells: CellsData }> {
  const [s, setS] = useState<MlState<{ model: ModelData; cells: CellsData }>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    Promise.all([loadModel(), loadCells()])
      .then(([model, cells]) => alive && setS({ status: 'ok', model, cells }))
      .catch(() => alive && setS({ status: 'missing' }));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
