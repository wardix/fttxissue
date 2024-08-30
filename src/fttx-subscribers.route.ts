import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { RowDataPacket } from 'mysql2'

interface RequestBody {
  operators: string[]
  branch: string
  cids: string[]
}

interface Row extends RowDataPacket {
  cid: string
  csid: string
  acc: string
  hp: string
}

const CID_ATTRIBUTE = 'Vendor CID'

export const fttxSubscribersRoute = async (fastify: FastifyInstance) => {
  fastify.post(
    '/',
    async (req: FastifyRequest<{ Body: RequestBody }>, reply: FastifyReply) => {
      const connection = await fastify.mysql.getConnection()

      try {
        const { operators, cids } = req.body
        console.log(req.body)

        const operatorsPlaceHolder = new Array(operators.length)
          .fill('?')
          .join(', ')
        const cidsPlaceHolder = new Array(cids.length).fill('?').join(', ')

        const [rows] = await connection.query<Row[]>(
          `
        SELECT cstc.value cid, cs.CustServId csid, cs.CustAccName acc, nf.id pop
        FROM CustomerServiceTechnicalCustom cstc
        LEFT JOIN CustomerServiceTechnicalLink cstl ON cstc.technicalTypeId = cstl.id
        LEFT JOIN noc_fiber nf ON cstl.foVendorId = nf.id
        LEFT JOIN CustomerServices cs ON cstl.CustServId = cs.custServId
        LEFT JOIN fiber_vendor fv ON nf.vendorId =  fv.id
        LEFT JOIN Customer c ON cs.CustId = c.CustId
        LEFT JOIN Employee e ON e.EmpId = c.SalesId
        WHERE cstc.attribute = ?
          AND fv.id IN (${operatorsPlaceHolder})
          AND cstc.value IN (${cidsPlaceHolder})`,
          [CID_ATTRIBUTE, ...operators, ...cids],
        )

        const subscription: Record<string, any[]> = {}
        const pops: any[] = []
        const csids: any[] = []

        for (const { cid, csid, acc, pop } of rows) {
          subscription[cid] = subscription[cid] ?? []
          subscription[cid].push({ csid, acc })
          if (!pops.includes(pop)) {
            pops.push(pop)
          }
          if (!csids.includes(csid)) {
            csids.push(csid)
          }
        }

        reply.send({ data: subscription })
      } catch (error) {
        fastify.log.error(error)
        reply.code(500).send({ error: 'Database operation failed.' })
      } finally {
        connection.release()
      }
    },
  )
}
