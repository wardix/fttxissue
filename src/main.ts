import Fastify from 'fastify'
import fastifyMySQL from '@fastify/mysql'
import { config } from 'dotenv'
import { fttxIssueRoute } from './fttx-issue.route'

config()

const MYSQL_URL = process.env.MYSQL_URL
const PORT = process.env.PORT! || 3000

const fastify = Fastify({ logger: true })

fastify.register(fastifyMySQL, { promise: true, connectionString: MYSQL_URL })
fastify.register(fttxIssueRoute, { prefix: '/v1/fttx-issue' })

fastify.get('/', async (_request, _reply) => {
  return { message: 'OK' }
})

fastify.listen({ port: +PORT }, (err) => {
  if (err) throw err
})
