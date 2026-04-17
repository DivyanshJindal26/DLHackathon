import { runInference, runSceneInference } from '../api/inferApi'
import useAppStore from '../store/appStore'

export function useInference() {
  const { files, selectedScene, setResult, setUploadStatus } = useAppStore()

  async function run() {
    setUploadStatus('uploading')
    try {
      let result
      if (selectedScene) {
        result = await runSceneInference(selectedScene)
      } else {
        result = await runInference(files)
      }
      setResult(result)
    } catch (err) {
      setUploadStatus('error', err.message)
    }
  }

  return { run }
}
