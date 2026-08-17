import { invoke } from '@tauri-apps/api/core'
import type { AppData, CheckResult } from './types'

export const loadData = () => invoke<AppData>('load_data')
export const saveData = (data: AppData) => invoke<void>('save_data', { data })
export const checkSite = (url: string) => invoke<CheckResult>('check_site_cmd', { url })
export const checkConnectivity = () => invoke<boolean>('check_connectivity_cmd')
export const getDataDir = () => invoke<string>('get_data_dir')
export const getDataFilePath = () => invoke<string>('get_data_file_path')
export const getDataLocation = () => invoke<{ dir: string; isFallback: boolean }>('get_data_location')
export const openDataDir = () => invoke<void>('open_data_dir')
export const minimizeWindow = () => invoke<void>('minimize_window')
export const toggleMaximizeWindow = () => invoke<void>('toggle_maximize_window')
export const closeWindow = () => invoke<void>('close_window')
export const isMaximized = () => invoke<boolean>('is_maximized')
export const exportMdToFile = (path: string) => invoke<void>('export_md_to_file', { path })
export const exportJsonToFile = (path: string) => invoke<void>('export_json_to_file', { path })
export const importMdFromFile = (path: string, mode: string) => invoke<AppData>('import_md_from_file', { path, mode })
export const importJsonFromFile = (path: string) => invoke<AppData>('import_json_from_file', { path })