import { FastifyInstance } from "fastify";

export const fttxIssueRoute = async (fastify: FastifyInstance) => {
  fastify.post("/", async (req: any, _reply) => {
    const connection = await fastify.mysql.getConnection();

    const {
      subject,
      effect,
      startTime,
      operator,
      operators,
      branch,
      pop,
      cids,
    } = req.body;

    const [result, _] = await connection.query(
      `
      INSERT INTO noc (
        start_time,
        end_time,
        subject,
        status,
        cause,
        effect,
        eksternal,
        branchId,
        employee_id,
        datetime,
        fo_vendor_id,
        fiber_vendor_id,
        effected_customer,
        type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        startTime,
        startTime,
        subject,
        "Open",
        "under investigate",
        effect,
        effect,
        branch,
        "0200306",
        operator,
        pop,
        "Ya",
        "fttx",
      ]
    );

    const insertId = (result as any).insertId;

    const operatorsPlaceHolder = new Array(operators.length)
      .fill("?")
      .join(", ");
    const cidsPlaceHolder = new Array(cids.length).fill("?").join(", ");

    const [rows, _fields] = await connection.query(
      `
      SELECT cstc.value cid, cs.CustServId csid, cs.CustAccName acc, e.EmpHP hp
      FROM CustomerServiceTechnicalCustom cstc
      LEFT JOIN CustomerServiceTechnicalLink cstl
        ON cstc.technicalTypeId = cstl.id 
      LEFT JOIN noc_fiber nf ON cstl.foVendorId = nf.id 
      LEFT JOIN CustomerServices cs ON cstl.CustServId = cs.custServId 
      LEFT JOIN fiber_vendor fv ON nf.vendorId =  fv.id 
      LEFT JOIN Customer c ON cs.CustId = c.CustId  
      LEFT JOIN Employee e ON e.EmpId = c.SalesId 
      WHERE cstc.attribute = 'Vendor CID' 
        AND fv.id IN (${operatorsPlaceHolder})
        AND cstc.value IN (${cidsPlaceHolder})`,
      [...operators, ...cids]
    );

    const notification: any = {};
    const subscription: any = {};
    for (const id in rows) {
      const { cid, csid, acc, hp } = (rows as any)[id];

      if (!notification.hasOwnProperty(hp)) {
        notification[hp] = [];
      }
      notification[hp].push({ csid, acc });

      if (!subscription.hasOwnProperty(cid)) {
        subscription[cid] = [];
      }
      subscription[cid].push({ csid, acc });
      connection.query(
        "INSERT INTO noc_customer_service (noc_id, cs_id) VALUES (?, ?)",
        [insertId, csid]
      );
    }

    connection.release();

    return { data: subscription };
  });
};
