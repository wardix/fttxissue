import { MySQLPromisePool } from '@fastify/mysql'

declare module 'fastify' {
  export interface FastifyInstance {
    mysql: MySQLPromisePool
  }
}
