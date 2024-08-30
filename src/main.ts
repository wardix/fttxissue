import Fastify from 'fastify'
import fastifyMySQL from '@fastify/mysql'
import { config } from 'dotenv'
import { fttxIssueRoute } from './fttx-issue.route'
import { fttxSubscribersRoute } from './fttx-subscribers.route'

config()

const MYSQL_URL = process.env.MYSQL_URL
const PORT = process.env.PORT! || 3000

const fastify = Fastify({ logger: true })

fastify.register(fastifyMySQL, { promise: true, connectionString: MYSQL_URL })
fastify.register(fttxIssueRoute, { prefix: '/v1/fttx-issue' })
fastify.register(fttxSubscribersRoute, { prefix: '/v1/fttx-subscribers' })

fastify.get('/', async (_request, _reply) => {
  return { message: 'OK' }
})

fastify.listen({ port: +PORT }, (err) => {
  if (err) throw err
})
