const paginateQuery = (query, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    return query.skip(skip).limit(limit);
};

const successResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

const errorResponse = (res, message = 'Error', statusCode = 400) => {
    return res.status(statusCode).json({
        success: false,
        message,
    });
};

module.exports = { paginateQuery, successResponse, errorResponse };
