import { invoke } from '@tauri-apps/api/core'
import type { AppData, CheckResult } from './types'

export const loadData = () => invoke<AppData>('load_data')
export const saveData = (data: AppData) => invoke<void>('save_data', { data })
export const checkSite = (url: string) => invoke<CheckResult>('check_site_cmd', { url })
export const checkConnectivity = () => invoke<boolean>('check_connectivity_cmd')
export const exportMd = () => invoke<string>('export_md_cmd')
export const importMd = (text: string, mode: string) => invoke<AppData>('import_md_cmd', { text, mode })
export const getDataDir = () => invoke<string>('get_data_dir')
export const migrateDataDir = (newDir: string) => invoke<void>('migrate_data_dir', { newDir })