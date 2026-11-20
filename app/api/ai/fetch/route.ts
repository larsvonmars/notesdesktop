import { handleDeepSeekToolRequest } from '../tool-proxy'

export const POST = (req: Request) => handleDeepSeekToolRequest(req, 'fetch')
